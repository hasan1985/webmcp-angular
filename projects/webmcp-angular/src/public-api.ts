/*
 * webmcp-angular — public API (core entry point)
 *
 * GOVERNING RULE: every symbol exported from THIS file must be structurally
 * identical to its `@angular/core` v22 counterpart — same parameters, same types,
 * same behaviour. Only the name differs: Angular prefixes these `Experimental`,
 * we do not.
 *
 * That keeps switching to Angular's native API a mechanical change (the migrate
 * schematic does it), rather than a rewrite. Additive ideas belong in /strict,
 * /polyfill, /bridge, /devtools, /testing — not here.
 *
 * Verified against @angular/core@22.1.6 — see docs/decisions/evidence.md §1.
 */

export type {
  WebMcpToolDescriptor,
  WebMcpToolExecute,
  WebMcpClient,
  JsonSchemaForInference,
} from './lib/core/tool-types';

export {
  declareWebMcpTool,
  provideWebMcpTools,
} from './lib/core/declare-tool';

// Not part of the v22 surface — internal, exported for /devtools and /testing.
export {
  resolveModelContext,
  isWebMcpSupported,
  normalizeInputSchema,
  displayTitle,
} from './lib/adapter/model-context-adapter';
export type {ModelContextSource, ResolvedModelContext} from './lib/adapter/model-context-adapter';

// NOT exported here, because v22 does not export them from @angular/core either:
//   provideExperimentalWebMcpForms  → lives in @angular/forms/signals (v22 Signal Forms)
//   withExperimentalAutoCleanupInjectors → lives in @angular/router (M6)
