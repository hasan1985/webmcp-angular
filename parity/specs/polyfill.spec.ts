import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {Injector, type EnvironmentInjector} from '@angular/core';
import {cleanupWebMCPPolyfill} from '@mcp-b/webmcp-polyfill';

import {
  installWebMcpPolyfill,
} from '../../dist/webmcp-angular/fesm2022/webmcp-angular-polyfill.mjs';
import {
  declareExperimentalWebMcpTool,
  isWebMcpSupported,
  resolveModelContext,
} from '../../dist/webmcp-angular/fesm2022/webmcp-angular.mjs';

/**
 * M4 — the polyfill entry point.
 *
 * Two things are being pinned down here: that installing the polyfill actually
 * makes registration work, and that it never overwrites a real implementation.
 */
describe('installWebMcpPolyfill', () => {
  let root: EnvironmentInjector;

  /**
   * `@mcp-b/webmcp-polyfill` 5.1.0 installs `modelContext` on **`Document.prototype`**,
   * and `cleanupWebMCPPolyfill()` does NOT remove that property — after cleanup,
   * `document.modelContext` is still truthy. So neither `delete document.modelContext`
   * nor the polyfill's own teardown gives a clean slate; the prototype property has to
   * go too, or every test after the first wrongly observes a "native" implementation.
   */
  const uninstallCompletely = () => {
    cleanupWebMCPPolyfill();
    delete (document as {modelContext?: unknown}).modelContext;
    delete (navigator as {modelContext?: unknown}).modelContext;
    delete (Document.prototype as {modelContext?: unknown}).modelContext;
    delete (Navigator.prototype as {modelContext?: unknown}).modelContext;
  };

  beforeEach(() => {
    uninstallCompletely();
    root = Injector.create({providers: []}) as EnvironmentInjector;
  });

  afterEach(uninstallCompletely);

  it('installs document.modelContext where the browser has none', async () => {
    expect(isWebMcpSupported()).toBe(false);

    const backing = await installWebMcpPolyfill();

    expect(backing).toBe('polyfill');
    expect(isWebMcpSupported()).toBe(true);
    expect(resolveModelContext().source).toBe('document');
  });

  it('makes tools actually registerable end to end', async () => {
    await installWebMcpPolyfill();

    await declareExperimentalWebMcpTool(
      {
        name: 'polyfilled',
        description: 'Registered through the polyfill.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => 'ok',
      },
      root,
    );

    const tools = await document.modelContext!.getTools();
    expect(tools.map((t) => t.name)).toContain('polyfilled');
  });

  it('unregisters through the polyfill when the injector is destroyed', async () => {
    await installWebMcpPolyfill();

    const child = Injector.create({providers: [], parent: root}) as EnvironmentInjector;
    await declareExperimentalWebMcpTool(
      {
        name: 'scoped_polyfilled',
        description: 'Should disappear on destroy.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => 'ok',
      },
      child,
    );

    expect((await document.modelContext!.getTools()).map((t) => t.name)).toContain(
      'scoped_polyfilled',
    );

    child.destroy();

    expect((await document.modelContext!.getTools()).map((t) => t.name)).not.toContain(
      'scoped_polyfilled',
    );
  });

  it('never replaces a native implementation', async () => {
    const native = {
      registerTool: async () => {},
      getTools: async () => [],
      __native: true,
    };
    Object.defineProperty(document, 'modelContext', {configurable: true, value: native});

    const backing = await installWebMcpPolyfill();

    expect(backing).toBe('native');
    expect(document.modelContext).toBe(native);
  });

  it('is idempotent — a second call reports native and changes nothing', async () => {
    expect(await installWebMcpPolyfill()).toBe('polyfill');
    const installed = document.modelContext;

    // Correct, if initially surprising: once something implements the API, this
    // helper's job is to leave it alone, whoever installed it.
    expect(await installWebMcpPolyfill()).toBe('native');
    expect(document.modelContext).toBe(installed);
  });
});
