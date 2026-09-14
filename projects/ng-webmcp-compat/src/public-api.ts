/*
 * ng-webmcp-compat — public API (core entry point)
 *
 * GOVERNING RULE: every symbol exported from THIS file must be signature-identical
 * to `@angular/core` v22. Migrating to Angular 22 must be a change of import path
 * and nothing else. Additive ideas belong in /strict, /bridge, /devtools, /testing.
 */

export type {
  WebMcpToolDescriptor,
  WebMcpToolExecute,
  WebMcpToolResult,
  JsonSchemaForInference,
} from './lib/core/tool-types';

// Not part of the v22 surface — internal, but exported for /devtools and /testing.
export {
  resolveModelContext,
  isWebMcpSupported,
  normalizeInputSchema,
  displayTitle,
} from './lib/adapter/model-context-adapter';
export type {ModelContextSource, ResolvedModelContext} from './lib/adapter/model-context-adapter';

// TODO(M1/M2) — the v22-identical runtime surface, still to implement:
//   declareExperimentalWebMcpTool(tool, injector?): Promise<void>
//   provideExperimentalWebMcpTools(tools[]): EnvironmentProviders
//   provideExperimentalWebMcpForms(): EnvironmentProviders          (warn no-op pre-v22)
//   withExperimentalAutoCleanupInjectors(): RouterFeature           (M6, riskiest item)
// Blocked on docs/M0-FINDINGS.md §5 — verify against a real Angular 22 .d.ts first.
