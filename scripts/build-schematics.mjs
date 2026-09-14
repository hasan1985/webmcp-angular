#!/usr/bin/env node
/**
 * ng-packagr does not build schematics, so this compiles them separately and
 * copies the JSON metadata into the same dist folder the tarball is packed from.
 * Run after `ng build ng-webmcp-compat`, which is what wipes dist.
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const repo = fileURLToPath(new URL('..', import.meta.url));
const src = join(repo, 'projects', 'ng-webmcp-compat', 'schematics');
const out = join(repo, 'dist', 'ng-webmcp-compat', 'schematics');

execFileSync('npx', ['tsc', '-p', join(repo, 'projects/ng-webmcp-compat/tsconfig.schematics.json')], {
  cwd: repo,
  stdio: 'inherit',
});

mkdirSync(join(out, 'migrate'), {recursive: true});

// The $schema path is relative to the source tree and does not resolve from dist;
// it is editor tooling only, so drop it rather than ship a broken pointer.
const collection = JSON.parse(readFileSync(join(src, 'collection.json'), 'utf8'));
delete collection.$schema;
writeFileSync(join(out, 'collection.json'), `${JSON.stringify(collection, null, 2)}\n`);

copyFileSync(join(src, 'migrate', 'schema.json'), join(out, 'migrate', 'schema.json'));

console.log('✔ schematics built into dist/ng-webmcp-compat/schematics');
