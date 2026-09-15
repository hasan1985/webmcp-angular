/*
 * webmcp-angular — public API (core entry point)
 *
 * GOVERNING RULE: every symbol exported from THIS file must be signature-identical
 * to `@angular/core` v22. Migrating to Angular 22 must be a change of import path
 * and nothing else. Additive ideas belong in /strict, /bridge, /devtools, /testing.
 *
 * Verified against @angular/core@22.1.6 — see docs/M0-FINDINGS.md.
 */

export type {
  WebMcpToolDescriptor,
  WebMcpToolExecute,
  WebMcpClient,
  JsonSchemaForInference,
} from './lib/core/tool-types';

export {
  declareExperimentalWebMcpTool,
  provideExperimentalWebMcpTools,
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
