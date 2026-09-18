#!/usr/bin/env node
/**
 * The second half of the M3 parity gate.
 *
 * The spec suite proves the two implementations *behave* alike. This proves they
 * *type* alike: it lifts the WebMCP declarations out of `@angular/core`'s shipped
 * .d.ts and out of our built .d.ts, normalizes away the naming Angular applies on
 * export, and diffs them. Any drift fails CI and becomes a reviewed decision
 * rather than something a user discovers while migrating.
 *
 * Usage: node scripts/api-diff.mjs
 */
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const ANGULAR_DTS = here('../node_modules/@angular/core/types/core.d.ts');
const OURS_DTS = here('../../dist/webmcp-angular/index.d.ts');

/**
 * `@angular/core` declares these internally under short names and renames them
 * on export. Compare against the exported names.
 */
const EXPORT_ALIASES = {
  Client: 'WebMcpClient',
  ToolDescriptor: 'WebMcpToolDescriptor',
  Execute: 'WebMcpToolExecute',
};

/**
 * Our functions drop Angular's `Experimental` prefix, so the comparison normalizes
 * the name away and checks what actually matters: parameters, type arguments and
 * return type. A rename is a deliberate, documented difference; a changed signature
 * is not.
 */
const SYMBOLS = [
  {kind: 'interface', angular: 'Client', ours: 'WebMcpClient'},
  {kind: 'type', angular: 'Execute', ours: 'WebMcpToolExecute'},
  {kind: 'interface', angular: 'ToolDescriptor', ours: 'WebMcpToolDescriptor'},
  {kind: 'function', angular: 'declareExperimentalWebMcpTool', ours: 'declareWebMcpTool'},
  {kind: 'function', angular: 'provideExperimentalWebMcpTools', ours: 'provideWebMcpTools'},
];

/** Extracts one declaration, brace-matching for interfaces. */
function extract(source, kind, name) {
  if (kind === 'interface') {
    const start = source.search(new RegExp(`(?:^|\\n)(?:declare )?interface ${name}\\b`));
    if (start < 0) return null;
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) {
        return source.slice(start, i + 1);
      }
    }
    return null;
  }

  const pattern =
    kind === 'type'
      ? new RegExp(`(?:^|\\n)(?:declare )?type ${name}<[^;]*?;`, 's')
      : new RegExp(`(?:^|\\n)declare function ${name}<[^;]*?;`, 's');
  const match = source.match(pattern);
  return match ? match[0] : null;
}

/** Strips comments and collapses whitespace so formatting differences don't count. */
function normalize(decl, aliases) {
  let out = decl
    .replace(/\/\*\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\bdeclare\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [from, to] of Object.entries(aliases)) {
    out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return out;
}

function main() {
  for (const [label, path] of [
    ['@angular/core', ANGULAR_DTS],
    ['webmcp-angular', OURS_DTS],
  ]) {
    if (!existsSync(path)) {
      console.error(`✖ Cannot read ${label} types at ${path}`);
      if (path === OURS_DTS) {
        console.error('  Build the library first: npx ng build webmcp-angular');
      }
      process.exit(2);
    }
  }

  const angularSrc = readFileSync(ANGULAR_DTS, 'utf8');
  const oursSrc = readFileSync(OURS_DTS, 'utf8');
  const angularVersion = JSON.parse(
    readFileSync(here('../node_modules/@angular/core/package.json'), 'utf8'),
  ).version;

  console.log(`API parity diff vs @angular/core@${angularVersion}\n`);

  let failures = 0;

  for (const {kind, angular, ours} of SYMBOLS) {
    const angularDecl = extract(angularSrc, kind, angular);
    const oursDecl = extract(oursSrc, kind, ours);

    if (!angularDecl) {
      console.error(`✖ ${ours}: not found in @angular/core — the upstream API moved.`);
      failures++;
      continue;
    }
    if (!oursDecl) {
      console.error(`✖ ${ours}: not found in our build.`);
      failures++;
      continue;
    }

    // Compare shapes, not names. Applied symmetrically to both sides: the three
    // types already share a name after EXPORT_ALIASES, while the two functions
    // differ by the Experimental prefix, so blanking both spellings everywhere is
    // the one rule that handles each case.
    const blankName = (text) =>
      text
        .replace(new RegExp(`\\b${angular}\\b`, 'g'), '<name>')
        .replace(new RegExp(`\\b${ours}\\b`, 'g'), '<name>');

    const a = blankName(normalize(angularDecl, EXPORT_ALIASES));
    const b = blankName(normalize(oursDecl, {}));

    if (a === b) {
      console.log(`✔ ${ours}`);
    } else {
      failures++;
      console.error(`✖ ${ours} DIVERGED`);
      console.error(`    @angular/core : ${a}`);
      console.error(`    ours          : ${b}`);
    }
  }

  console.log();
  if (failures > 0) {
    console.error(
      `✖ ${failures} of ${SYMBOLS.length} declarations diverged from @angular/core@${angularVersion}.`,
    );
    console.error(
      '  Either match upstream, or record a deliberate divergence in docs/decisions/.',
    );
    process.exit(1);
  }
  console.log(
    `✔ All ${SYMBOLS.length} declarations match @angular/core@${angularVersion}` +
      ' (names normalized: we drop the Experimental prefix).',
  );
}

main();
