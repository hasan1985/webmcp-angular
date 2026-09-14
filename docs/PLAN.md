# ng-webmcp-kit — Requirements & Implementation Plan

> An **API-compatible backport of Angular v22's experimental WebMCP support** for
> Angular < 22. Same exported names, same signatures, same semantics — so migrating
> to the built-in version is a change of import path (and eventually a codemod).
>
> Status: planning only. No code written yet.

---

## 0. The governing constraint

**Everything in this package exists to be deleted.**

The success criterion is not "best Angular WebMCP library." It is: *the day the app
reaches Angular 22, swapping `ng-webmcp-kit` for `@angular/core` changes no
application code except imports.*

That single rule decides every open question from the previous draft:

| Question | Resolved by the rule |
|---|---|
| Public API design | Copied verbatim from `@angular/core` v22. No inventions in the core entry point. |
| Schema library | Whatever Angular uses — `JsonSchemaForInference` from `@mcp-b/webmcp-types`. No Zod in the core API. |
| Resources / prompts | **Out.** Angular doesn't have them; adding them creates migration debt. |
| Registry / governance / inspector | Allowed **only** in separate, clearly-marked entry points that the app can opt into knowing they won't survive migration. |
| Transports | Same — optional entry point, not core. |
| Behaviour on v22+ | Detect `@angular/core`'s implementation and **delegate** to it, never double-register. |

Anything that tempts you to "improve" the API is a future migration bug. Improvements
go upstream as an Angular issue/PR, not into this package's core.

---

## 1. Research findings (Sept 2026)

### 1.1 What WebMCP is

A **W3C Web Machine Learning CG draft** (Google + Microsoft) — not an Anthropic MCP
transport, and **not JSON-RPC**. It adds one browser object:

```js
document.modelContext      // Chrome 150+
navigator.modelContext     // deprecated in Chrome 150; still present in 149
```

| Member | Signature |
|---|---|
| `registerTool(tool, opts)` | `Promise<undefined>` — `opts: { exposedTo?: string[], signal?: AbortSignal }` |
| `getTools(opts)` | `Promise<RegisteredTool[]>` |
| `executeTool(tool, input, opts)` | `Promise<DOMString>` (JSON string) |
| `ontoolchange` | event; `toolchange` fires on document + descendants |

`ModelContextTool` = `{ name, title?, description, inputSchema?, execute, annotations? }`,
`annotations` = `{ readOnlyHint, untrustedContentHint, consequentialHint }`,
`execute(input, { signal }) => Promise<any>`.

Design-relevant constraints:
- Tool names 1–128 chars `[A-Za-z0-9_.-]`, **globally unique per document**; collision → `InvalidStateError`.
- **No `unregisterTool()`.** Unregistration is *only* via the `AbortSignal` passed to `registerTool`.
- Permissions Policy feature `"tools"`, default `'self'`; cross-origin iframes need `allow="tools"`.
- Spec scope is **tools only**. No resources, no prompts.
- Unsettled: binary/multimodal I/O, navigation mid-call, streaming, output schemas.

### 1.2 Your original mental model, corrected

> "Like JSON-RPC to native browser function call."

JSON-RPC-over-`postMessage` is **MCP-B's** vendor approach (bridging a page to Claude
Desktop / Cursor via a relay). The W3C spec has no wire format at all — it's a direct
in-page JS call. Both are real; only the first is standard, and only the first is what
Angular implements. Since we're mirroring Angular, **JSON-RPC is explicitly not part of
the core** — it lives in an optional `/bridge` entry point (§6).

### 1.3 Prior art

| Project | Relevance here |
|---|---|
| [`webmachinelearning/webmcp`](https://github.com/webmachinelearning/webmcp) | the spec we're ultimately tracking |
| [Angular v22 `ai/webmcp`](https://angular.dev/ai/webmcp) | **the thing we are copying** |
| [`@mcp-b/webmcp-types`](https://www.npmjs.com/package/@mcp-b/webmcp-types) | Angular vendors this as `third_party/@mcp-b/webmcp-types` for `JsonSchemaForInference` — we depend on it directly |
| [`@mcp-b/webmcp-polyfill`](https://github.com/WebMCP-org/npm-packages) | gives `document.modelContext` where absent — our runtime floor |
| `@mcp-b/transports`, `@mcp-b/webmcp-local-relay` | optional `/bridge` and dev tooling |
| [`NicoAvanzDev/ng-webmcp`](https://github.com/NicoAvanzDev/ng-webmcp) | decorator-based, *not* v22-compatible — deliberately different goal, not a competitor for us |
| [`@mcp-b/react-webmcp`](https://github.com/WebMCP-org/npm-packages) | React equivalent; reference for ergonomics only |

---

## 2. The exact API to reproduce

> **Verified against `@angular/core@22.1.6`** (shipped `types/core.d.ts` +
> `fesm2022/core.mjs`), not documentation. Full detail and the four corrections this
> made to an earlier inferred version of this section are in `docs/M0-FINDINGS.md`.

### 2.1 Types (`@angular/core`)

```ts
import type {JsonSchemaForInference, InferArgsFromInputSchema} from '@mcp-b/webmcp-types';
// v22 vendors that same package under third_party/@mcp-b/webmcp-types.

/** exported as WebMcpClient */
interface Client {
  signal: AbortSignal;
}

/** exported as WebMcpToolExecute — note the second parameter and `unknown` return */
type Execute<InputSchema extends JsonSchemaForInference> = (
  args: InferArgsFromInputSchema<InputSchema>,
  client: Client,
) => unknown;

/** exported as WebMcpToolDescriptor — four members, no title/annotations/exposedTo */
interface ToolDescriptor<InputSchema extends JsonSchemaForInference> {
  name: string;
  description: string;
  inputSchema: InputSchema;
  execute: Execute<InputSchema>;
}
```

There is **no `WebMcpToolResult`**. A tool returns `unknown`; Angular serializes it, and
the JSDoc notes the result "is typically just a raw `string`."

### 2.2 Functions, and which package each lives in

```ts
// @angular/core
declare function declareExperimentalWebMcpTool<const InputSchema extends JsonSchemaForInference>(
  tool: ToolDescriptor<InputSchema>, injector?: Injector): Promise<void>;

declare function provideExperimentalWebMcpTools<const InputSchema extends JsonSchemaForInference>(
  tools: ToolDescriptor<InputSchema>[]): EnvironmentProviders;

// @angular/forms/signals   — NOT core
declare function provideExperimentalWebMcpForms(): EnvironmentProviders;

// @angular/router          — NOT core
declare function withExperimentalAutoCleanupInjectors(): ExperimentalAutoCleanupInjectorsFeature;
```

The core entry point must export only the first two; exporting the others would itself
break parity.

### 2.3 Semantics, confirmed from the implementation

1. `execute` runs inside the owning `Injector`'s injection context — `inject()` works.
2. Lifecycle is `DestroyRef.onDestroy → AbortController.abort() → registerTool({signal})`.
   The spec has no `unregisterTool`; aborting *is* unregistration.
3. The wrapper composes `AbortSignal.any([appTeardown, client.signal])`, so either the
   injector being destroyed or the agent aborting cancels the call.
4. Unsupported browser or SSR → **silent early `return`**. No warning, no throw.
5. Resolution order is `document.modelContext ?? navigator.modelContext`.
6. **No implicit input validation.** `execute` must validate its own args.
7. Duplicate names surface as an **unhandled promise rejection**, not a synchronous throw
   — `provideExperimentalWebMcpTools` does not await its registrations.
8. Signal Forms: `form(model, {experimentalWebMcpTool: {name, description}})` infers the
   schema from the model's *initial value*, derives `required` from validators, and wires
   validation + submit so the agent can self-correct. No inference from
   `null`/`undefined`/empty arrays; async validators are not triggered.
9. Every primitive v22 uses exists in **Angular 20** — at this floor the backport needs
   no shims.

### 2.4 Known upstream defect — replicate, don't fix

[angular/angular#70125](https://github.com/angular/angular/issues/70125): the array
signature collapses heterogeneous schemas to a union, so a tool taking `number` types as
`number | { [x: string]: unknown }`.

**Decision: reproduce the signature exactly, bug included.** A "fixed" signature that
accepts code Angular rejects is a migration trap. Mitigate with an *additive, optional*
identity helper in a separate entry point:

```ts
// ng-webmcp-compat/strict — opt-in, doesn't change the core signature
export const webMcpTool = <const S extends JsonSchemaForInference>(
  t: WebMcpToolDescriptor<S>,
) => t;
```

Forward-compatible: if upstream fixes #70125, the helper degrades to a no-op.

## 3. Requirements

### 3.1 Functional

**FR-1 — API parity (the core)**
- FR-1.1 Export `declareExperimentalWebMcpTool`, `provideExperimentalWebMcpTools`, `WebMcpToolDescriptor`, `WebMcpToolExecute`, `WebMcpToolResult` with byte-identical signatures to v22.
- FR-1.2 `execute` invoked via `runInInjectionContext` of the owning injector.
- FR-1.3 Unregistration driven by `DestroyRef` → `AbortController.abort()` → spec's `registerTool` signal. (Angular's lifecycle and the spec's lifecycle are literally the same mechanism.)
- FR-1.4 Duplicate-name behaviour matches v22: throw.
- FR-1.5 Re-export types from `@mcp-b/webmcp-types` rather than redefining, so structural compatibility with v22 is guaranteed by construction.

**FR-2 — Backport shims for pre-v22 gaps**
- FR-2.1 `provideEnvironmentInitializer` (v19+) — on v17/18 fall back to the `ENVIRONMENT_INITIALIZER` multi-provider.
- FR-2.2 `withExperimentalAutoCleanupInjectors()` — **the hardest item.** Pre-v22 routers don't destroy route-level environment injectors on navigation. Provide a router-events-driven shim that tracks route injectors and destroys stale ones. If a faithful shim proves unsafe, ship a *documented alternative*: declare route tools in the routed component via `declareExperimentalWebMcpTool()`, which cleans up on component destroy in every version.
- FR-2.3 `provideExperimentalWebMcpForms()` — Signal Forms don't exist pre-v22. Export the symbol so imports don't break; make it a **no-op with a dev-mode warning**, and document that form tools must be hand-written until v22. (Optionally: a Reactive Forms equivalent in `/forms-compat`, explicitly non-migrating.)

**FR-3 — Runtime adapter**
- FR-3.1 Resolve the API in order: `document.modelContext` → `navigator.modelContext` (Chrome 149) → polyfill → unsupported.
- FR-3.2 Optional `@mcp-b/webmcp-polyfill` integration, as an *optional peer dependency* — never bundled by default.
- FR-3.3 When unsupported: registration resolves silently, `execute` never fires, one dev-mode warning. Never throw, never break the app.
- FR-3.4 SSR/prerender: no-op on the server; register on `afterNextRender`. Zoneless-safe.

**FR-4 — v22+ delegation (critical)**
- FR-4.1 At build or runtime, detect whether `@angular/core` already exports `declareExperimentalWebMcpTool`. If so, **delegate to it** and emit a dev-mode "you can migrate now" notice.
- FR-4.2 Guarantee no double registration when the app mixes our imports and core imports during migration.

**FR-5 — Migration tooling**
- FR-5.1 `ng generate ng-webmcp-kit:migrate` — rewrites imports from `ng-webmcp-kit` to `@angular/core`, removes the dependency, reports anything from a non-core entry point that needs manual attention.
- FR-5.2 `ng add ng-webmcp-kit` — wires providers into `app.config.ts`.

**FR-6 — Optional, explicitly non-migrating entry points** *(each documented as "you will have to remove this at v22")*
- FR-6.1 `/strict` — the `webMcpTool()` inference helper (§2.4).
- FR-6.2 `/bridge` — JSON-RPC-over-`postMessage` transport (MCP-B wire-compatible) so tools also reach Claude Desktop / Cursor via the local relay. **This is the one genuinely additive capability Angular has no plan for**, and the reason your original JSON-RPC instinct still earns a place.
- FR-6.3 `/devtools` — dev-only inspector: list registered tools, view schemas, invoke manually. Stripped in prod.
- FR-6.4 `/testing` — polyfill harness, `expectTool(name)` matchers, fake agent invoker.

### 3.2 Non-functional

| ID | Requirement |
|---|---|
| NFR-1 | Core entry point ≤ 6 kB gzip. Optional entry points tree-shaken; `/devtools` stripped in prod builds. |
| NFR-2 | Peer deps: Angular `>=19 <24` (see §7 Q1). `@mcp-b/webmcp-types` a real dep (types only); `@mcp-b/webmcp-polyfill` an optional peer. |
| NFR-3 | **Parity test suite**: the same spec file runs against our impl and, on a v22 fixture app, against `@angular/core`. Divergence fails CI. This is the primary quality gate. |
| NFR-4 | Strict TS. `.d.ts` compared against v22's via API-extractor snapshot; drift is a reviewed decision. |
| NFR-5 | Zero runtime error when the browser API is absent. |
| NFR-6 | Spec drift isolated to the runtime adapter (FR-3.1), never the public API. |
| NFR-7 | Version support matrix tested in CI: Angular 19/20/21/22 × (native, polyfill, unsupported). |

### 3.3 Out of scope
Resources, prompts, a public registry API, governance/consent, decorators, browser
extension, server-side MCP, DOM-scraping fallbacks, multimodal I/O. **All of these would
create migration debt.** If you later want them, they belong in a *different* package
layered on top — not here.

---

## 4. Architecture

```
  Application code  — imports ONLY v22-identical symbols
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ ng-webmcp-kit  (core entry point)                         │
│   declareExperimentalWebMcpTool / provideExperimentalWebMcpTools │
│   ┌─────────────────────────────────────────────────┐     │
│   │ CoreDelegationGuard                              │     │
│   │  @angular/core has it?  ──yes──▶ delegate, warn  │     │
│   └──────────────┬───────────────────────────────────┘     │
│                  │ no                                       │
│   ┌──────────────▼───────────────────────────────────┐     │
│   │ Backport impl                                     │     │
│   │  • runInInjectionContext(execute)                 │     │
│   │  • DestroyRef ──▶ AbortController ──▶ spec signal │     │
│   │  • EnvironmentInitializer shim (v17/18)           │     │
│   │  • duplicate-name guard (parity: throw)           │     │
│   └──────────────┬───────────────────────────────────┘     │
└──────────────────┼─────────────────────────────────────────┘
                   ▼
        ModelContextAdapter  (spec-drift firewall)
   document.modelContext │ navigator.modelContext │ polyfill │ noop
                   │
                   └──▶ (optional) /bridge → JSON-RPC/postMessage → relay → Claude Desktop
```

The `DestroyRef → AbortController → registerTool({ signal })` chain is the whole
lifecycle story. Because the spec has no `unregisterTool`, and Angular's teardown is
`DestroyRef`, the two compose exactly. Build this first; everything else hangs off it.

### 4.1 Usage — identical to v22 docs

```ts
// app.config.ts
import { provideExperimentalWebMcpTools } from 'ng-webmcp-kit';  // ← only line that changes at v22

bootstrapApplication(App, {
  providers: [
    provideRouter(routes, withExperimentalAutoCleanupInjectors()),
    provideExperimentalWebMcpTools([
      {
        name: 'greet',
        description: 'Greets the agent.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => {
          const svc = inject(GreetingService);
          return { content: [{ type: 'text', text: svc.greet() }] };
        },
      },
    ]),
  ],
});
```

```ts
// service-level
@Injectable({ providedIn: 'root' })
export class CartService {
  constructor() {
    declareExperimentalWebMcpTool({
      name: 'add_to_cart',
      description: 'Add a product to the shopping cart.',
      inputSchema: {
        type: 'object',
        properties: { sku: { type: 'string' }, qty: { type: 'number' } },
        required: ['sku', 'qty'],
      },
      execute: async ({ sku, qty }) => {
        if (typeof sku !== 'string' || !Number.isInteger(qty)) {   // no implicit validation — FR-1.x parity
          return { content: [{ type: 'text', text: 'Invalid arguments.' }] };
        }
        await this.add(sku, qty);
        return { content: [{ type: 'text', text: `Added ${qty}× ${sku}.` }] };
      },
    });
  }
}
```

---

## 5. Package layout

```
ng-webmcp-kit/
  projects/kit/
    src/                    core — v22-identical surface only   → ng-webmcp-kit
    src/strict/             webMcpTool() inference helper       → /strict
    src/polyfill/           installWebMcpPolyfill()             → /polyfill
    src/bridge/             JSON-RPC / postMessage transport    → /bridge
    src/devtools/           inspector (dev only)                → /devtools
    src/testing/            harness + matchers                  → /testing
    schematics/             ng-add, migrate
  parity/                   v22 fixture; runs the shared spec against @angular/core
                            (the showcase app is a SEPARATE repo — it must install
                             the built package, not import workspace source)
```

---

## 6. Milestones

| # | Milestone | Contents | Exit criteria |
|---|---|---|---|
| ~~M0~~ | ✅ **Fidelity spike** | Read `@angular/core@22.1.6` `.d.ts` + `fesm2022`; corrected §2 in four places; located forms/router symbols | **Done** — `docs/M0-FINDINGS.md` |
| ~~M1~~ | ✅ Lifecycle core | `model-context-adapter.ts`, DestroyRef→Abort chain, `AbortSignal.any` composition, `runInInjectionContext` execute | **Done** — untested in a real browser; see M3/M4 |
| ~~M2~~ | ✅ Core API surface | `declareExperimentalWebMcpTool`, `provideExperimentalWebMcpTools`, types. No env-initializer shim needed at a v20 floor | **Done** — emitted `.d.ts` signatures match v22 |
| ~~M3~~ | ✅ **Parity suite** | `parity/` — shared spec + fake ModelContext, run against ours on 20/21/22 and against `@angular/core` on 22; `.d.ts` diff script; GitHub Actions matrix + weekly drift cron | **Done** — 12/12 on v20 and v21, 24/24 on v22; all 5 declarations match |
| ~~M4~~ | ✅ Unsupported / SSR / polyfill | `/polyfill` entry point (`installWebMcpPolyfill`); SSR + unsupported-browser + cross-generation specs against the **built artifact**; real Angular SSR fixture prerendered via `scripts/check-packaging.mjs` | **Done** — 7 SSR, 15 env/polyfill tests; prerender emits `webmcp-supported: false`; regression-tested by removing the guard |
| M5 | v22 delegation + migrate schematic | `CoreDelegationGuard`, `ng generate :migrate`. *(The packaging check landed early with M4 — `scripts/check-packaging.mjs`.)* | Migration = one command, zero source edits |
| M6 | `withExperimentalAutoCleanupInjectors` shim | Router-events injector cleanup, or documented component-scoped alternative. **Riskier than first assessed**: `RouterFeatureKind` is a numeric enum, v22 uses `10` | Route tools gone after navigation, proven by e2e |
| M7 | `/testing` + `/devtools` | harness, matchers, inspector | Tools testable without a real browser agent |
| M8 | `/bridge` (JSON-RPC) | postMessage transport, origin allowlist, MCP-B wire compat | A registered tool callable from Claude Desktop via local relay |
| M9 | `/strict`, `ng add` | opt-in extras. `provideExperimentalWebMcpForms` lives in `@angular/forms/signals`, so core must not export it | — |
| M10 | 1.0 | docs, version matrix, spec-drift + upstream-tracking policy | npm publish |

M0–M4 are complete, and the core has been exercised in a real browser (see
`../ng-webmcp-playground`). What stands between here and `0.1.0` is M5's migration
schematic and a decision on M6.
M8 is the only place your JSON-RPC idea belongs, and it can wait.

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Angular changes the experimental API (explicitly allowed outside majors) | **High** | Parity suite (M3) catches it; track `@angular/core` releases; version our package `0.x` and pin a "targets Angular v22.N" in the README |
| §2 signatures inferred from docs, not source | High | M0 exists solely to verify against the real `.d.ts` before any code is written |
| `withExperimentalAutoCleanupInjectors` shim is unsafe pre-v22 | Med-High | Accept the documented component-scoped fallback (FR-2.2) rather than ship a leaky injector hack |
| Spec churn (`navigator`→`document` already happened) | Med | Confined to `ModelContextAdapter` (NFR-6) |
| Double registration during migration | Med | FR-4 delegation guard + migrate schematic |
| Optional entry points become load-bearing and block migration | Med | Every non-core entry point documents its removal cost; `:migrate` reports usages |
| Chrome-only, behind a flag | Low | Polyfill path keeps it usable; this is a bet on the standard, which is the premise |
| `@mcp-b/*` is vendor-controlled (their extension went closed-source) | Low | Only the *types* package is a hard dep; polyfill and bridge are optional |

---

## 8. Remaining decisions

1. **Minimum Angular version.** Recommend **19** — `provideEnvironmentInitializer`, stable `DestroyRef`, stable signals, no shims needed. Supporting 17/18 costs the FR-2.1 shim and two more CI legs. What version is the project on today?
2. **Package name.** `ng-webmcp-kit` is a placeholder; something like `ng-webmcp-backport` or `@<yourorg>/webmcp-compat` states the intent better. Publishing under your own scope avoids collision with the existing `ng-webmcp`.
3. **`/bridge` (JSON-RPC) — in v1 or defer?** Deferring to M8 keeps the first release tight; it's the only feature with no v22 equivalent, so it's also the strongest reason for the package to outlive the migration.
4. **Route-level tools pre-v22** — attempt the injector-cleanup shim, or ship only the documented component-scoped pattern? The shim is the riskiest code in the plan.

---

## Sources

- [WebMCP spec draft](https://webmachinelearning.github.io/webmcp/) · [explainer repo](https://github.com/webmachinelearning/webmcp)
- [Angular — WebMCP (experimental)](https://angular.dev/ai/webmcp) · [`declareExperimentalWebMcpTool`](https://angular.dev/api/core/declareExperimentalWebMcpTool) · [`provideExperimentalWebMcpTools`](https://angular.dev/api/core/provideExperimentalWebMcpTools) · [`WebMcpToolDescriptor`](https://angular.dev/api/core/WebMcpToolDescriptor) · [`WebMcpToolExecute`](https://angular.dev/api/core/WebMcpToolExecute)
- [angular/angular@3b0ae5f — feat(core): add `provideWebMcpTools`](https://github.com/angular/angular/commit/3b0ae5fef0328477ee0f5d51980217e7c583a606)
- [angular/angular#70125 — heterogeneous tool input typing](https://github.com/angular/angular/issues/70125)
- [WebMCP-org/npm-packages](https://github.com/WebMCP-org/npm-packages) · [`@mcp-b/webmcp-types`](https://www.npmjs.com/package/@mcp-b/webmcp-types) · [`@mcp-b/transports` docs](https://docs.mcp-b.ai/packages/transports)
- [NicoAvanzDev/ng-webmcp](https://github.com/NicoAvanzDev/ng-webmcp) · [Angular v22 WebMCP Tools Explained — Brian Treese](https://briantree.se/angular-webmcp-tools/)
