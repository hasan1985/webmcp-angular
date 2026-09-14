#!/usr/bin/env node
/**
 * M4 / M5 — the packaging + SSR gate.
 *
 * Everything else in this repo tests source or a built artifact imported directly.
 * This is the only check that consumes the library the way a user does: build it,
 * `npm pack` it, install the **tarball** into a real Angular SSR app, and prerender.
 *
 * It covers three things nothing else can:
 *
 *  1. The published artifact installs and resolves — `exports` map, entry points,
 *     peer ranges, `.d.ts` reachability.
 *  2. Secondary entry points type-check at a consumer. `ng-webmcp-compat/strict`
 *     imports its types from the primary entry *by package name*; under a `file:`
 *     install that symlinks, TypeScript resolves to the real path and the
 *     self-reference silently degrades to `any` (see docs/M0-FINDINGS.md §6.1).
 *     A tarball installs as a real directory, which is why this uses one.
 *  3. **Server-side rendering.** The fixture prerenders at build time, so bootstrap
 *     — and therefore tool registration — executes in Node with no `document`.
 *     An unguarded `document` access fails the build here, loudly, instead of
 *     taking down a user's server render.
 *
 * Usage: node scripts/check-packaging.mjs [--keep]
 */
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(repo, 'fixtures', 'ssr-consumer');
const dist = join(repo, 'dist', 'ng-webmcp-compat');
const keep = process.argv.includes('--keep');

const run = (cmd, args, cwd) => {
  process.stdout.write(`  $ ${cmd} ${args.join(' ')}\n`);
  return execFileSync(cmd, args, {cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8'});
};

const step = (n, text) => console.log(`\n[${n}/5] ${text}`);
const fail = (message, detail) => {
  console.error(`\n✖ ${message}`);
  if (detail) console.error(String(detail).split('\n').slice(-40).join('\n'));
  process.exit(1);
};

step(1, 'Build the library (including schematics)');
try {
  run('npm', ['run', 'build:lib'], repo);
} catch (error) {
  fail('Library build failed.', error.stdout || error.stderr);
}

// ng-packagr does not build schematics, so they are easy to forget and would ship
// broken: `ng generate ng-webmcp-compat:migrate` fails with a confusing error if
// the collection is missing from the package.
for (const required of [
  'schematics/collection.json',
  'schematics/migrate/index.js',
  'schematics/migrate/schema.json',
]) {
  if (!existsSync(join(dist, required))) {
    fail(`Missing ${required} in dist — run scripts/build-schematics.mjs.`);
  }
}

step(2, 'Pack the tarball');
let tarball;
try {
  const packed = run('npm', ['pack', '--pack-destination', repo], dist).trim().split('\n').pop();
  tarball = join(repo, packed);
  if (!existsSync(tarball)) fail(`npm pack reported ${packed} but the file is not there.`);
  console.log(`  → ${packed}`);
} catch (error) {
  fail('npm pack failed.', error.stdout || error.stderr);
}

step(3, 'Install the tarball into the SSR fixture');
try {
  // A real install, not a link: the symlink path is exactly what breaks
  // secondary entry points (M0-FINDINGS §6.1).
  run('npm', ['install', '--no-audit', '--no-fund'], fixture);
  run('npm', ['install', '--no-save', '--no-audit', '--no-fund', tarball], fixture);
} catch (error) {
  fail('Installing the tarball into the fixture failed.', error.stdout || error.stderr);
}

step(4, 'Prerender the fixture (bootstrap runs in Node, with no document)');
let buildOutput = '';
try {
  buildOutput = run('npx', ['ng', 'build'], fixture);
} catch (error) {
  fail(
    'Prerendering failed. If this says "document is not defined", the library is ' +
      'touching the DOM unguarded and would break a real app\'s server render.',
    error.stdout || error.stderr,
  );
}

step(5, 'Verify the prerendered HTML');
const browserDir = join(fixture, 'dist', 'ssr-consumer', 'browser');
if (!existsSync(browserDir)) fail(`No prerender output at ${browserDir}`);

// `index.csr.html` is the client-side-render fallback shell and is always empty;
// the prerendered markup is in `index.html`. Sorting would pick the wrong one.
const html = readdirSync(browserDir).filter(
  (f) => f.endsWith('.html') && !f.endsWith('.csr.html'),
);
if (html.length === 0) {
  fail(`No prerendered .html emitted into ${browserDir} — only a CSR shell, if that.`);
}

const page = html.includes('index.html') ? 'index.html' : html[0];
const index = readFileSync(join(browserDir, page), 'utf8');
if (!index.includes('SSR consumer fixture')) {
  fail('Prerendered HTML does not contain the fixture content — the app did not render.');
}
// Registration must be skipped server-side, so the server-rendered markup has to
// report `false`. `true` would mean the guard did not hold.
if (!index.includes('webmcp-supported: false')) {
  fail(
    'Prerendered HTML should report `webmcp-supported: false`. Anything else means ' +
      'the library believed WebMCP was available during a server render.',
  );
}
console.log(`  → ${page}: rendered, webmcp-supported: false`);

if (!keep) {
  rmSync(tarball, {force: true});
}

console.log(`
✔ Packaging + SSR check passed.
  · tarball installs and resolves in a real Angular app
  · secondary entry points type-check at a consumer
  · prerender succeeds with no document, and registers nothing server-side
  · the migrate schematic collection is present in the package
${buildOutput.includes('Prerendered') ? '' : '  (note: build output did not mention prerendering — verify the fixture still uses outputMode "static")\n'}`);
