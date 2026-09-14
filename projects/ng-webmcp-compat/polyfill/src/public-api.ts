/*
 * ng-webmcp-compat/polyfill
 *
 * NON-MIGRATING entry point: Angular v22 has no equivalent. Anything imported
 * from here must be removed or replaced by hand when migrating to @angular/core.
 */

import {resolveModelContext} from 'ng-webmcp-compat';

/** What backed `document.modelContext` after `installWebMcpPolyfill()` returned. */
export type WebMcpBacking =
  /** The browser's own implementation. The polyfill was not loaded. */
  | 'native'
  /** `@mcp-b/webmcp-polyfill` installed it. */
  | 'polyfill'
  /** Server render or prerender — nothing was installed, and nothing should be. */
  | 'server'
  /** The polyfill is not installed as a dependency, so tools cannot register. */
  | 'unavailable';

export interface InstallWebMcpPolyfillOptions {
  /**
   * Also install `navigator.modelContextTesting`, a removed Chromium preview API
   * that some tooling still looks for. Off by default, matching the polyfill.
   */
  installTestingShim?: boolean;
}

/**
 * Installs `document.modelContext` where the browser does not provide it.
 *
 * ── Call this BEFORE `bootstrapApplication`, and await it ────────────────────
 *
 * ```ts
 * // main.ts
 * import {installWebMcpPolyfill} from 'ng-webmcp-compat/polyfill';
 *
 * installWebMcpPolyfill()
 *   .then(() => bootstrapApplication(App, appConfig))
 *   .catch((err) => console.error(err));
 * ```
 *
 * Use a `.then` chain, not top-level `await`: Angular's default browserslist
 * targets reject it, and the build fails with "Top-level await is not available in
 * the configured target environment".
 *
 * It is deliberately **not** an Angular provider. `provideExperimentalWebMcpTools`
 * registers its tools from an environment initializer during bootstrap, and loading
 * the polyfill requires an async dynamic import. A polyfill provider would therefore
 * resolve *after* the tools had already tried (and silently failed) to register —
 * an ordering trap with no error message. Awaiting before bootstrap has no such
 * failure mode.
 *
 * Safe everywhere: it no-ops during a server render, and resolves to `'unavailable'`
 * rather than throwing if the optional peer dependency is absent.
 *
 * `@mcp-b/webmcp-polyfill` is an **optional peer dependency** — install it yourself:
 *
 * ```bash
 * npm i @mcp-b/webmcp-polyfill
 * ```
 */
export async function installWebMcpPolyfill(
  options: InstallWebMcpPolyfillOptions = {},
): Promise<WebMcpBacking> {
  // A server render has no document to install onto, and no agent to serve.
  if (typeof document === 'undefined') {
    return 'server';
  }

  // Never replace a real implementation — the browser's own is always better.
  if (resolveModelContext().modelContext) {
    return 'native';
  }

  try {
    const {initializeWebMCPPolyfill} = await import('@mcp-b/webmcp-polyfill');
    initializeWebMCPPolyfill({installTestingShim: options.installTestingShim ?? false});
  } catch {
    // Optional peer dependency is not installed. Registration stays a silent
    // no-op, exactly as in a browser with no WebMCP at all.
    return 'unavailable';
  }

  return resolveModelContext().modelContext ? 'polyfill' : 'unavailable';
}
