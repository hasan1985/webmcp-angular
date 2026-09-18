import type {ModelContext} from '@mcp-b/webmcp-types';

/** Which implementation, if any, backs `resolveModelContext()`. */
export type ModelContextSource = 'document' | 'navigator' | 'none';

export interface ResolvedModelContext {
  readonly source: ModelContextSource;
  readonly modelContext: ModelContext | null;
}

/**
 * The spec-drift firewall. Everything that knows *where* the browser API lives
 * is confined to this file (PLAN NFR-6).
 *
 * Resolution order — see `docs/decisions/evidence.md` 1.5:
 *   1. `document.modelContext`   canonical, Chrome 150+
 *   2. `navigator.modelContext`  deprecated in Chrome 150, still present in 149
 *   3. none                      polyfill absent / non-Chromium / SSR
 *
 * A polyfill such as `@mcp-b/webmcp-polyfill` installs itself onto
 * `document.modelContext`, so it is picked up by branch 1 with no special case.
 */
export function resolveModelContext(): ResolvedModelContext {
  // SSR / prerender: no document at all. Never throw here (PLAN FR-3.4).
  if (typeof document === 'undefined') {
    return {source: 'none', modelContext: null};
  }

  const fromDocument = document.modelContext;
  if (fromDocument) {
    return {source: 'document', modelContext: fromDocument};
  }

  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return {source: 'navigator', modelContext: navigator.modelContext};
  }

  return {source: 'none', modelContext: null};
}

/** True when this document can register tools at all. */
export function isWebMcpSupported(): boolean {
  return resolveModelContext().modelContext !== null;
}

/**
 * `RegisteredTool.inputSchema` is a JSON *string* in Chrome 149–153 and an
 * object from Chrome 154.0.8013 (webmcp#241). Consumers must branch on `typeof`
 * and guard the parse. See `docs/decisions/evidence.md` 2.2.
 *
 * Only needed by `/devtools` and `/testing`; core never reads tools back.
 */
export function normalizeInputSchema(schema: unknown): Record<string, unknown> | null {
  if (schema == null) {
    return null;
  }
  if (typeof schema === 'object') {
    return schema as Record<string, unknown>;
  }
  if (typeof schema === 'string') {
    try {
      const parsed: unknown = JSON.parse(schema);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The spec defaults `title` to the empty string rather than omitting it, so `??`
 * does not fall through. See `docs/decisions/evidence.md` 2.3.
 */
export function displayTitle(tool: {name: string; title?: string}): string {
  return tool.title || tool.name;
}
