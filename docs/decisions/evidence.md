# Evidence

What was verified against shipped sources or measured in a browser, and when. The
decision records cite this instead of repeating it. Nothing here is a decision;
every item is a fact with a source.

**Sources read:** `@angular/core@22.1.6` (`types/core.d.ts`, `fesm2022/core.mjs`),
`@angular/forms` and `@angular/router` 22.1.6, `@angular/router` 21.0.0 / 21.1.0 /
21.2.23 (packed from the registry), `@mcp-b/webmcp-types` and
`@mcp-b/webmcp-polyfill` 5.1.0 (source at `~/myGitHub/npm-packages`), the W3C draft
at <https://webmachinelearning.github.io/webmcp/>. **Measured in:** Chrome 152 on
Angular 20.3.31, polyfill-backed, via `webmcp-angular-playground`; jsdom via the
parity suite.

## 1 · The Angular 22 API, from source (September 2026)

| Finding | Detail | Feeds |
|---|---|---|
| **1.1** `execute` takes two arguments and returns `unknown` | `(args, client: {signal: AbortSignal}) => unknown`. No `{content: [...]}` envelope; no `WebMcpToolResult` type exists — an early scaffold invented one, deleted | [001](./001-mirror-angular-not-invent.md) |
| **1.2** Exported names | `Client → WebMcpClient`, `ToolDescriptor → WebMcpToolDescriptor`, `Execute → WebMcpToolExecute`; `declareExperimentalWebMcpTool`, `provideExperimentalWebMcpTools`. Descriptor has four members: `name`, `description`, `inputSchema`, `execute` — no `title`, `annotations`, `exposedTo` | [003](./003-naming.md) |
| **1.3** Two symbols are not in `@angular/core` | `provideExperimentalWebMcpForms` → `@angular/forms/signals`; `withExperimentalAutoCleanupInjectors` → `@angular/router`. The core must not export them | [004](./004-core-and-extras-split.md) |
| **1.4** Duplicate names are an unhandled rejection | `provideExperimentalWebMcpTools` loops `declareExperimentalWebMcpTool(tool)` without `await`; `registerTool` rejects with `InvalidStateError`; nothing throws, bootstrap succeeds. Identical in our source | [001](./001-mirror-angular-not-invent.md), chapter 6 §2 |
| **1.5** The whole implementation is 25 lines | `ngServerMode` guard → `document.modelContext ?? navigator.modelContext` → `inject(Injector)`, `DestroyRef`, `AbortController` → wrapped `execute` with `AbortSignal.any([abortCtrl.signal, client.signal])` inside `runInInjectionContext` → `destroyRef.onDestroy(abort)` → `registerTool({signal})` | [005](./005-ssr-guard.md), chapter 2 |
| **1.6** Types come from `@mcp-b/webmcp-types` | `core.d.ts` imports `JsonSchemaForInference`, `InferArgsFromInputSchema` from `../third_party/@mcp-b/webmcp-types`. `@mcp-b`'s own `ToolDescriptor` is generic over *args*, Angular's over the *schema* — not interchangeable; we define ours to match Angular and borrow only the two primitives | [001](./001-mirror-angular-not-invent.md) |
| **1.7** `ngDevMode`, `Document.modelContext`, `Navigator.modelContext` are already declared | re-declaring is `TS2451`; both `modelContext` members are optional, so the unsupported path types for free | — |

## 2 · The draft and the types package

| Finding | Detail | Feeds |
|---|---|---|
| **2.1** `executeTool` has two shapes | `@mcp-b/webmcp-types` 5.1.0 has it on `ChromeModelContextExtensions`, optional, taking a JSON **string**; the polyfill's parser is `parseChromeToolInput`. The draft (Sep 2026) has it on `ModelContext` taking an **object**. Everything runnable today takes the string | chapter 6 §4, [010 polyfill](../polyfill/03-execute-tool.md) |
| **2.2** `inputSchema` has two generations | string until [webmcp#241](https://github.com/webmachinelearning/webmcp/pull/241); object rolling out from Chrome 154.0.8013, cross-document tools first; origin-trial builds still return the string for same-document tools; the polyfill returns the object. `normalizeInputSchema()` branches on `typeof` | chapter 6 §5 |
| **2.3** `title` comes back as `''` | Chrome and the polyfill return the empty string for a tool registered without one; the draft leaves it to the implementation; [webmcp#224](https://github.com/webmachinelearning/webmcp/issues/224) (open) proposes omitting it. `displayTitle()` uses `\|\|` | chapter 6 §6 |
| **2.4** `toolchange` fires at the `ModelContext` | the draft fires it at the document's `ModelContext` (`ontoolchange` is that interface's attribute); the polyfill does the same. Corrected 16 Sep 2026 — first written up as "the spec says document" | [013](./013-listen-on-both-targets.md) |
| **2.5** `consequentialHint` is in the draft's prose, not in the types package | moot for the core, which has no `annotations` | — |
| **2.6** `withExperimentalAutoCleanupInjectors` exists from `@angular/router` **21.1.0** | absent in 21.0.0, present in 21.1.0, 21.2.23, 22.1.7 with the identical body `routerFeature(10, …)`. Corrected 16 Sep 2026 — first believed a v22 addition | [007](./007-no-route-injector-shim.md) |

## 3 · Measured in Chrome (playground, polyfill 5.1.0, Angular 20.3.31)

| Finding | Detail | Feeds |
|---|---|---|
| **3.1** Registration and scoping work outside jsdom | tool count 3 (`/game`) → 5 (`/notes`) → 3 (back); a move made via `executeTool` renders on the board | [016](./016-playground-separate-repo.md) |
| **3.2** Route-level `providers` leak | a probe route with `providers: [provideWebMcpTools([probeLeakTool])]`; after navigating away and back, `probe_leak` still registered; component-declared tools correctly gone | [007](./007-no-route-injector-shim.md) |
| **3.3** `toolchange` listener target | across four route changes: `document.addEventListener` 0 calls, `modelContext.addEventListener` 4, `modelContext.ontoolchange` 4. 20 jsdom tests were green because the test fake fires on both targets | [013](./013-listen-on-both-targets.md) |
| **3.4** Bridge end to end | `initialize` negotiates `2025-11-25`; `tools/list` returns full schemas; `tools/call` plays a move; `list_changed` fires on navigation | [012](./012-bridge-dependency-free.md) |
| **3.5** The WebMCP toggle, from request bodies | off → no `tools` key, plain prompt, model says it cannot see the page; on → four tools, `get_board` runs | [019](./019-tools-toggle-governs-sending.md) |
| **3.6** The opt-in bridge | fresh load off, no bridge chunk requested; enable → chunk fetched, `mcp-check-ready` answered; disable → `mcp-server-stopped`, probe unanswered; survives reload | [022](./022-bridge-opt-in.md) |
| **3.7** `about_this_app` cost | 94 characters in every `getTools()`, 989 fetched once per session | [018](./018-app-context-as-a-tool.md) |

## 4 · Packaging and tests

| Finding | Detail | Feeds |
|---|---|---|
| **4.1** `file:` installs break secondary entry points | a symlink; TypeScript resolves to the real path, so `strict/index.d.ts`'s `from 'webmcp-angular'` never finds a `node_modules` containing the package; under `skipLibCheck` the types silently degrade to `any` — `TS7031`. A packed tarball installs as a real directory | [011](./011-tarball-not-file-install.md) |
| **4.2** `webMcpTool()` fixes authoring, not the provider call | the `/strict` doc comment overstated this and was corrected | [009](./009-one-provider-call-per-tool.md) |
| **4.3** Polyfill cleanup restores what it installed | measured on the shipped 5.1.0 in a clean jsdom: after `cleanupWebMCPPolyfill()`, `document.modelContext` is `undefined` and `Document.prototype` has no own `modelContext`. It skips — and so never removes — a `modelContext` that existed before install, which is a shared test realm's usual state; `parity/specs/polyfill.spec.ts` clears both `document` and the prototype in teardown. Corrected 16 Sep 2026 — first written up as "cleanup does not uninstall" | [polyfill/01](../polyfill/01-install-and-cleanup.md#cleanup) |
| **4.4** What the parity suite covers against the built artifact | no `document` (SSR, 7 tests); `document` without `modelContext`; `navigator.modelContext` only; `inputSchema` as string; polyfill-backed; a real SSR app prerendered by `check-packaging.mjs` reporting `webmcp-supported: false` — regression-tested by deleting the `typeof document` guard | [010](./010-parity-gate.md) |
| **4.5** jsdom cannot test event targets or `postMessage` identity | same-window `postMessage` has `origin: ''` and `source: null`; `bridge.spec.ts` dispatches a hand-built `MessageEvent` | [013](./013-listen-on-both-targets.md) |
| **4.6** Not yet measured | Firefox and Safari themselves; native Chrome with `--enable-features=WebMCP` (including whether `inputSchema` is a string on that build); that tools register on the client after hydration | [STATUS](../STATUS.md) |
