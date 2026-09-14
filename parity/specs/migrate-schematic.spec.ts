import {describe, it, expect, beforeEach} from 'vitest';
import {HostTree} from '@angular-devkit/schematics';
import {SchematicTestRunner, UnitTestTree} from '@angular-devkit/schematics/testing';
import {fileURLToPath} from 'node:url';

const collection = fileURLToPath(
  new URL('../../dist/ng-webmcp-compat/schematics/collection.json', import.meta.url),
);

/**
 * M5 — the migration schematic.
 *
 * This is the one piece of tooling that can quietly corrupt a user's source, so it
 * is worth more tests than its size suggests. The rules it must never break:
 *
 *  1. Rewrite ONLY the module specifier — never reorder, reformat, or drop code.
 *  2. Never rewrite an import it does not fully understand. A reported import a
 *     human then fixes is fine; a silently-wrong rewrite is not.
 *  3. Never remove the dependency while any import still needs a decision.
 */
describe('ng generate ng-webmcp-compat:migrate', () => {
  let runner: SchematicTestRunner;
  let tree: UnitTestTree;

  const pkg = (deps: Record<string, string>) =>
    JSON.stringify({name: 'app', dependencies: deps}, null, 2);

  beforeEach(() => {
    runner = new SchematicTestRunner('ng-webmcp-compat', collection);
    tree = new UnitTestTree(new HostTree());
    tree.create('/package.json', pkg({'ng-webmcp-compat': '^0.0.1', '@angular/core': '^22.1.6'}));
  });

  const run = () => runner.runSchematic('migrate', {}, tree);

  it('rewrites a core import to @angular/core and leaves everything else alone', async () => {
    tree.create(
      '/src/app.config.ts',
      [
        `import {ApplicationConfig} from '@angular/core';`,
        `import {provideExperimentalWebMcpTools} from 'ng-webmcp-compat';`,
        ``,
        `export const appConfig: ApplicationConfig = {`,
        `  providers: [provideExperimentalWebMcpTools([])],`,
        `};`,
        ``,
      ].join('\n'),
    );

    const result = await run();
    const after = result.readContent('/src/app.config.ts');

    expect(after).toContain(`import {provideExperimentalWebMcpTools} from '@angular/core';`);
    expect(after).not.toContain('ng-webmcp-compat');
    // Nothing but the specifier may move.
    expect(after).toContain(`import {ApplicationConfig} from '@angular/core';`);
    expect(after).toContain(`  providers: [provideExperimentalWebMcpTools([])],`);
  });

  it('preserves type-only imports and aliases verbatim', async () => {
    tree.create(
      '/src/tools.ts',
      [
        `import {declareExperimentalWebMcpTool, type WebMcpToolDescriptor as Desc} from 'ng-webmcp-compat';`,
        `export type T = Desc<{type: 'object'}>;`,
        `export const d = declareExperimentalWebMcpTool;`,
        ``,
      ].join('\n'),
    );

    const after = (await run()).readContent('/src/tools.ts');
    expect(after).toContain(
      `import {declareExperimentalWebMcpTool, type WebMcpToolDescriptor as Desc} from '@angular/core';`,
    );
  });

  it('removes the dependency from package.json on a clean migration', async () => {
    tree.create(
      '/src/a.ts',
      `import {declareExperimentalWebMcpTool} from 'ng-webmcp-compat';\nexport const a = declareExperimentalWebMcpTool;\n`,
    );

    const after = JSON.parse((await run()).readContent('/package.json'));
    expect(after.dependencies['ng-webmcp-compat']).toBeUndefined();
    expect(after.dependencies['@angular/core']).toBe('^22.1.6');
  });

  it('does NOT rewrite a secondary entry point, and keeps the dependency', async () => {
    tree.create(
      '/src/tools.ts',
      [
        `import {provideExperimentalWebMcpTools} from 'ng-webmcp-compat';`,
        `import {webMcpTool} from 'ng-webmcp-compat/strict';`,
        `export const t = webMcpTool;`,
        ``,
      ].join('\n'),
    );

    const result = await run();
    const after = result.readContent('/src/tools.ts');

    // The core import still migrates…
    expect(after).toContain(`import {provideExperimentalWebMcpTools} from '@angular/core';`);
    // …but /strict has no @angular/core equivalent, so it is untouched.
    expect(after).toContain(`import {webMcpTool} from 'ng-webmcp-compat/strict';`);

    // And the dependency must survive, or the remaining import would break.
    const json = JSON.parse(result.readContent('/package.json'));
    expect(json.dependencies['ng-webmcp-compat']).toBe('^0.0.1');
  });

  it('does NOT rewrite symbols @angular/core does not export', async () => {
    tree.create(
      '/src/probe.ts',
      `import {isWebMcpSupported} from 'ng-webmcp-compat';\nexport const s = isWebMcpSupported();\n`,
    );

    const result = await run();
    expect(result.readContent('/src/probe.ts')).toContain(
      `import {isWebMcpSupported} from 'ng-webmcp-compat';`,
    );
    expect(JSON.parse(result.readContent('/package.json')).dependencies['ng-webmcp-compat']).toBe(
      '^0.0.1',
    );
  });

  it('does NOT rewrite a namespace import', async () => {
    tree.create(
      '/src/ns.ts',
      `import * as webmcp from 'ng-webmcp-compat';\nexport const d = webmcp.declareExperimentalWebMcpTool;\n`,
    );

    const after = (await run()).readContent('/src/ns.ts');
    expect(after).toContain(`import * as webmcp from 'ng-webmcp-compat';`);
  });

  it('ignores the package name in comments and strings', async () => {
    const content = [
      `// see the ng-webmcp-compat README`,
      `export const note = 'ng-webmcp-compat is a backport';`,
      ``,
    ].join('\n');
    tree.create('/src/text.ts', content);

    expect((await run()).readContent('/src/text.ts')).toBe(content);
  });

  it('skips node_modules and dist', async () => {
    const content = `import {declareExperimentalWebMcpTool} from 'ng-webmcp-compat';\n`;
    tree.create('/node_modules/some-lib/index.ts', content);
    tree.create('/dist/build-output.ts', content);

    const result = await run();
    expect(result.readContent('/node_modules/some-lib/index.ts')).toBe(content);
    expect(result.readContent('/dist/build-output.ts')).toBe(content);
  });

  it('handles a file with several imports and rewrites only the eligible one', async () => {
    tree.create(
      '/src/mixed.ts',
      [
        `import {Component} from '@angular/core';`,
        `import {declareExperimentalWebMcpTool} from 'ng-webmcp-compat';`,
        `import {installWebMcpPolyfill} from 'ng-webmcp-compat/polyfill';`,
        `import {webMcpTool} from 'ng-webmcp-compat/strict';`,
        ``,
      ].join('\n'),
    );

    const after = (await run()).readContent('/src/mixed.ts');
    expect(after).toContain(`import {declareExperimentalWebMcpTool} from '@angular/core';`);
    expect(after).toContain(`from 'ng-webmcp-compat/polyfill';`);
    expect(after).toContain(`from 'ng-webmcp-compat/strict';`);
    expect(after).toContain(`import {Component} from '@angular/core';`);
  });
});
