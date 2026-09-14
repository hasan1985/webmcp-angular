# M0 — Fidelity findings (CLOSED)

Verified against real shipped sources, not documentation prose.

| Source | Version |
|---|---|
| Workspace Angular | 20.3.31 |
| `@angular/core` read for parity | **22.1.6** (`latest`) — `types/core.d.ts`, `fesm2022/core.mjs` |
| `@angular/forms`, `@angular/router` read for placement | 22.1.6 |
| `@mcp-b/webmcp-types` | 5.1.0 (deps `@modelcontextprotocol/server` 2.0.0) |

**M0 §5 of the previous revision is now closed.** Every item is answered below.
`docs/PLAN.md` §2 was inferred from documentation and was wrong in four places.

---

## 1. Corrections to the Angular API in PLAN §2

### 1.1 `execute` takes a SECOND parameter, and returns `unknown` — not `{content: [...]}`

Documentation showed a one-arg callback returning a `{content: [{type, text}]}`
envelope. The shipped type:

```ts
interface Client {
  signal: AbortSignal;
}

type Execute<InputSchema extends JsonSchemaForInference> = (
  args: InferArgsFromInputSchema<InputSchema>,
  client: Client,
) => unknown;
```

Two consequences:

- **`WebMcpToolResult` does not exist.** Angular has no such type. The JSDoc says the
  result "is typically just a raw `string`" and is serialized for the agent. Our
  previously-scaffolded `WebMcpToolResult` was an invention; it has been deleted.
- **Tools receive a cancellation signal.** `Client` is exported publicly as
  `WebMcpClient`. Every tool can honour agent-side abort.

### 1.2 The real exported names

```ts
// @angular/core@22.1.6 — aliased on export
export type {
  Client        as WebMcpClient,
  ToolDescriptor as WebMcpToolDescriptor,
  Execute        as WebMcpToolExecute,
};
export { declareExperimentalWebMcpTool, provideExperimentalWebMcpTools };
```

`WebMcpToolDescriptor` has exactly four members — `name`, `description`, `inputSchema`,
`execute`. **No `title`, no `annotations`, no `exposedTo`.** Angular exposes none of the
spec's annotation hints.

### 1.3 The other two symbols are not in `@angular/core`

PLAN §2 listed all four together. Verified placement:

| Symbol | Package |
|---|---|
| `declareExperimentalWebMcpTool`, `provideExperimentalWebMcpTools` | `@angular/core` |
| `provideExperimentalWebMcpForms` | **`@angular/forms/signals`** |
| `withExperimentalAutoCleanupInjectors` | **`@angular/router`** |

So the core entry point must **not** export the latter two — doing so would break parity.

Signal Forms option shape, from `FormOptions<TModel>`:

```ts
experimentalWebMcpTool?: {
  name: string;         // The unique name of the WebMCP tool to create from this form.
  description: string;  // A description of the tool's purpose and usage information.
};
```

Router feature:

```ts
type ExperimentalAutoCleanupInjectorsFeature =
  RouterFeature<RouterFeatureKind.ExperimentalAutoCleanupInjectorsFeature>;  // kind = 10
declare function withExperimentalAutoCleanupInjectors(): ExperimentalAutoCleanupInjectorsFeature;
```

`RouterFeatureKind` is a numeric enum and `10` is v22's value. A backport cannot mint a
valid `RouterFeature` for v20's router without matching its enum — **this confirms M6 as
the riskiest item** and strengthens the case for the documented component-scoped fallback
over a shim.

### 1.4 Duplicate names produce an unhandled rejection, not a throw

PLAN FR-1.4 said "matches v22: throw." The shipped implementation:

```js
function provideExperimentalWebMcpTools(tools) {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => {
    for (const tool of tools) declareExperimentalWebMcpTool(tool);   // NOT awaited
  })]);
}
```

`declareExperimentalWebMcpTool` is `async` and awaits `modelContext.registerTool`, which
rejects with `InvalidStateError` on a duplicate name. Because the loop does not await,
a collision surfaces as an **unhandled promise rejection** — it does not throw
synchronously and does not fail bootstrap. Reproduced verbatim.

---

## 2. The complete v22 implementation (25 lines)

```js
async function declareExperimentalWebMcpTool(tool, injector) {
  if (typeof ngServerMode !== 'undefined' && ngServerMode) return;
  const modelContext = globalThis.document.modelContext ?? globalThis.navigator.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return;
  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    if (!injector) assertInInjectionContext(declareExperimentalWebMcpTool);
  }
  const currentInjector = injector ?? inject(Injector);
  const destroyRef = currentInjector.get(DestroyRef);
  const abortCtrl = new AbortController();
  const wrappedTool = {
    ...tool,
    execute: (args, client) => {
      const signal = client?.signal
        ? AbortSignal.any([abortCtrl.signal, client.signal])
        : abortCtrl.signal;
      return runInInjectionContext(currentInjector, () =>
        tool.execute(args, {...client, signal}));
    },
  };
  destroyRef.onDestroy(() => void abortCtrl.abort());
  await modelContext.registerTool(wrappedTool, {signal: abortCtrl.signal});
}
```

Observations that matter:

1. **`DestroyRef → AbortController → registerTool({signal})` is confirmed** as the entire
   lifecycle — PLAN §4's central claim holds exactly.
2. **`AbortSignal.any([appTeardown, agentCancel])`** composes the two cancellation
   sources, so either the injector being destroyed or the agent aborting ends the call.
3. **Silent no-op when unsupported** — early `return`, no warning, no throw.
4. **Resolution order is `document` then `navigator`**, matching our adapter.
5. Every primitive it uses (`assertInInjectionContext`, `provideEnvironmentInitializer`,
   `makeEnvironmentProviders`, `runInInjectionContext`, `DestroyRef`) **exists in Angular
   20** — so the backport needs no shims at all at a v20 floor.

### 2.1 One deliberate divergence

v22 guards SSR with the `ngServerMode` build global. That global is not reliable pre-v22,
so `declare-tool.ts` uses `typeof document === 'undefined'` instead. Behaviourally
identical, and it also avoids v22's latent `globalThis.document.modelContext` throw when
`document` is absent.

---

## 3. Findings from `@mcp-b/webmcp-types` 5.1.0

### 3.1 `executeTool` is NOT standard

```ts
interface ModelContext extends EventTarget {
  registerTool(tool, options?): Promise<void>;   // 3 overloads
  getTools(options?): Promise<RegisteredTool[]>;
  ontoolchange: ((this: ModelContext, event: Event) => unknown) | null;
}
interface ChromeModelContextExtensions {
  executeTool?(tool, inputArguments: string, options?): Promise<string | null>;
}
```

PLAN §1.1 listed `executeTool` as standard. It is an optional Chromium extension —
feature-detect it. Needed only by `/devtools` and `/testing`; core never calls it.

### 3.2 `@mcp-b`'s `ToolDescriptor` cannot be reused (PLAN FR-1.5 was wrong)

```ts
// @mcp-b/webmcp-types — generic over ARGS
type ToolDescriptor<TArgs extends WebMcpToolInput, TResult, TName extends string> = ...
// @angular/core v22 — generic over the SCHEMA
interface ToolDescriptor<InputSchema extends JsonSchemaForInference> { ... }
```

**Revised FR-1.5:** define `WebMcpToolDescriptor` locally to match Angular, and borrow
only the two inference primitives Angular itself borrows:

```ts
import type {JsonSchemaForInference, InferArgsFromInputSchema} from '@mcp-b/webmcp-types';
```

Confirmed as exactly what v22 does — `core.d.ts` line 19:

```ts
import { JsonSchemaForInference, InferArgsFromInputSchema }
  from '../third_party/@mcp-b/webmcp-types/index.js';
```

`JsonSchemaForInference` is `JsonSchemaType` re-exported from
`@modelcontextprotocol/server`, so the constraint is identical by construction.

### 3.3 `consequentialHint` is not in the types package

Ships only `readOnlyHint` and `untrustedContentHint` (plus MCP's own annotations).
`consequentialHint` appears in spec prose but not in the types — live spec drift.
Moot for the core surface, since Angular has no `annotations` property at all.

### 3.4 Globals are already declared — do not re-declare

```ts
interface Document { readonly modelContext?: ModelContext; }
interface Navigator {
  /** @deprecated */ readonly modelContext?: ModelContext;
  /** @deprecated */ modelContextTesting?: ModelContextTesting;
}
```

Both **optional**, so the unsupported-browser path falls out of the type system for free.
`globalThis.ModelContext` may be undefined — a bare reference throws `ReferenceError`;
guard with `typeof ModelContext !== 'undefined'`.

`ngDevMode` is likewise already declared by `@angular/core` — re-declaring it is a
`TS2451` build error.

---

## 4. New adapter requirements

**FR-3.5 — `RegisteredTool.inputSchema` has two generations.**

```ts
inputSchema?: InputSchema | string;
```

An object since webmcp#241, rolling out from **Chrome 154.0.8013** (cross-document tools
first); **Chrome 149–153 — most of the current Origin Trial population — and 154's
same-document tools still return a serialized JSON string.** Branch on `typeof` and guard
the parse. Implemented as `normalizeInputSchema()`.

**FR-3.6 — `RegisteredTool.title` defaults to `''`**, so `??` does not fall through. Read
as `tool.title || tool.name`. (webmcp#224 proposes omitting the member instead — handle
both.) Implemented as `displayTitle()`.

**FR-3.7 — `navigator.modelContextTesting`** is a deprecated third surface
(`listTools()`, `executeTool()`, `ontoolchange`) from older Chromium previews. Useful for
`/testing`; not for core.

Resolution order is unchanged and now confirmed against v22's own implementation:

```
document.modelContext → navigator.modelContext → polyfill → no-op
```

---

## 5. Consequences for the plan

- **M1 and M2 are done.** With the implementation in hand and no shims needed at a v20
  floor, the core surface is implemented and building; emitted `.d.ts` signatures match
  v22's.
- **FR-2.1 (env-initializer shim) is unnecessary** at a v20 floor and can be dropped.
- **FR-2.3 changes:** `provideExperimentalWebMcpForms` belongs to `@angular/forms/signals`,
  so the core entry point must not export it at all — not even as a warning no-op.
- **M6 got riskier:** `RouterFeatureKind` is a numeric enum whose v22 value for this
  feature is `10`. Prefer the documented component-scoped pattern over a shim.
- **M3 (parity suite) is still the release gate** — it now has a concrete target to diff
  against, and the v22 tarball in the scratchpad is a ready-made fixture.

---

## 6. Findings from consuming the built package (playground, Chrome)

From building `../ng-webmcp-playground` against the packed tarball and running it in
a real browser. These are exactly the class of defect the parity suite cannot reach,
since parity imports workspace source.

### 6.1 A `file:` install breaks secondary entry points — PACKAGING BUG

`npm i file:../ng-webmcp-compat/dist/ng-webmcp-compat` creates a **symlink**.
TypeScript resolves symlinks to their real path (`preserveSymlinks: false` by
default), so from `dist/ng-webmcp-compat/strict/` the import in `strict/index.d.ts`:

```ts
import { JsonSchemaForInference, WebMcpToolDescriptor } from 'ng-webmcp-compat';
```

cannot find the package — walking up from the real path never reaches a
`node_modules` containing it. With `skipLibCheck` on (the Angular CLI default) the
resolution failure is silent: the types degrade to `any`, and consumers get

```
TS7031: Binding element 'square' implicitly has an 'any' type.
```

on their tool arguments, with nothing pointing at the real cause.

Installing a **packed tarball** works, because npm unpacks it into a real directory.

**Action:** the M5 packaging check must install a tarball, and should additionally
assert that a consumer using a secondary entry point type-checks. Consider whether
secondary entry points should import from a relative path rather than the package
name — `ng-packagr`'s default is the package name, so this may be worth an upstream
question rather than a local workaround.

### 6.2 `webMcpTool()` does not fix the provider call — doc correction

`/strict`'s helper fixes *authoring* inference inside one descriptor. It does **not**
fix `provideExperimentalWebMcpTools`, which has a single type parameter for the whole
array: heterogeneous schemas have no valid `S`, and the call fails to compile with or
without the helper. The cast-free fix is one provider call per tool, keeping each
array homogeneous. The doc comment has been corrected — it previously overstated this.

### 6.3 Real-browser confirmation

Chrome, polyfill-backed (`@mcp-b/webmcp-polyfill` 5.1.0):

- `document.modelContext` present; `executeTool` present (a Chromium extension the
  polyfill also implements, so the demo works without native support).
- `getTools()` returned `inputSchema` as an **object**, not the Chrome 149–153 string
  form. FR-3.5's string arm is therefore still untested against a real browser.
- Tool count went 3 (`/game`) → 5 (`/notes`) → 3 (back), so
  `DestroyRef → AbortController → registerTool({signal})` unregisters correctly
  outside jsdom.
- Tools and UI share state: a move made via `executeTool` renders on the board.
