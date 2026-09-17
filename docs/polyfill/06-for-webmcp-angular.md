[← declarative forms](./05-declarative-forms.md) · [contents](./README.md)

# 6. What it means for `webmcp-angular`

Every polyfill behaviour this package is built around, and where it lives in our
code. When one of these changes upstream, this is the checklist.

## Behaviour → our code

| Polyfill behaviour | Source | Where we absorb it |
|---|---|---|
| `title` defaults to `''` | `getTools` map | `displayTitle()` in `src/lib/adapter/model-context-adapter.ts` — `tool.title \|\| tool.name`; bridge `tools/list` does the same |
| `inputSchema` is an object (Chrome 149–153: a string) | `getTools` map, `REGISTERED_INPUT_SCHEMA` | `normalizeInputSchema()` in the adapter — `typeof` branch, guarded parse |
| `annotations` omitted when none registered | `getTools` map | bridge copies it only when present |
| `toolchange` fires at the context, after `setTimeout(0)` | `#notifyToolsChanged` | bridge and devtools listen on `document.modelContext` (and on `document` as a hedge); test harness fires both |
| `executeTool` takes a JSON string | `parseChromeToolInput` | bridge `tools/call` and devtools "run" each `JSON.stringify` at one call site |
| `RegisteredTool` must be one from `getTools()` (window + origin match) | `executeTool` steps 3–5 | both callers `find()` the tool by name first and pass that object |
| `execute` receives one argument, no client | `normalizeToolDescriptor` | our wrapper builds `{...client, signal: AbortSignal.any([...])}`; `client` is `undefined` here, so the signal is the injector's teardown alone |
| a thrown tool → `UnknownError('…invocation failed: msg')` | `createToolInvocationFailedError` | bridge maps any rejection to `{content, isError: true}` |
| duplicate name → `InvalidStateError` rejection | `normalizeToolDescriptor` | un-awaited in `provideWebMcpTools` → unhandled rejection; documented as the symptom |
| `exposedTo` / `fromOrigins` → `NotSupportedError` | `registerTool` / `getTools` | `declareWebMcpTool` never sets them; documented as native-only |
| getter on `Document.prototype`, cleanup restores it | `installProperty` list | `parity/specs/polyfill.spec.ts` clears `document` and the prototype in teardown, for anything *else* that installed one |
| `installTestingShim` off by default | `initializeWebMCPPolyfill` | `installWebMcpPolyfill({installTestingShim})` passes it through, default `false` |
| declines silently on insecure origins | `isSecureContext === false` | `installWebMcpPolyfill()` reports `'unavailable'` |
| declarative forms run on every polyfilled page | `installDeclarativeForms` | not wrapped; a `<form toolname>` in your template becomes a tool with no Angular involvement |

## Where we diverge from the polyfill on purpose

| | Polyfill | Us | Why |
|---|---|---|---|
| Who owns tool lifetime | the `AbortSignal` you pass | the injector — we create the controller and abort it from `DestroyRef` | that is the whole Angular integration ([architecture chapter 2](../architecture/02-the-lifecycle.md)) |
| `execute` context | plain call | `runInInjectionContext(injector, …)` | so `inject()` works inside a tool |
| Cancellation | races the await only | `client.signal` handed to the tool | so `fetch` inside a tool can actually stop |
| `toolchange` listener target | the context | both targets | the harness fake dispatches on both; a real hedge costs nothing |

## Where Chrome and the draft diverge from the polyfill

Worth keeping in view, because the polyfill is the reference you develop against
but not the thing that ships:

| Surface | Draft (Sep 2026) | Chrome origin trial | Polyfill 5.1.0 |
|---|---|---|---|
| `executeTool` | in the interface, argument **object** | extension, JSON **string** | extension, JSON **string** |
| `getTools().inputSchema` | object | string on 149–153, object from 154 | object |
| `toolchange` target | `ModelContext` | `ModelContext` | `ModelContext` |
| `exposedTo` / `fromOrigins` | supported | supported | `NotSupportedError` |
| `navigator.modelContext` | removed | deprecated alias on 150+ | deprecated alias, warns once |
| `modelContextTesting` | — | removed | opt-in shim |

## The 70 promises

The unit-test names are the polyfill's contract in one screen. Grouped:

**Install and identity** — exports stable init/cleanup; installs strict core methods;
installs the exposed `ModelContext` constructor and brands the instance; readonly
document descriptor and deprecated navigator accessor; both share one instance;
one-time deprecation warning on `navigator`, none on `document`; sets
`__isWebMCPPolyfill`; does not override an existing `document.modelContext`; aliases
a legacy native `navigator.modelContext` onto `document`; does not override native
surfaces when both exist; idempotent when already installed; rolls back earlier
property installs when a later one fails.

**Registration** — resolves `undefined`, rejects duplicates; serializes `inputSchema`
without validating keywords; invokes `execute` with only the input; `signal` aborts
unregister; a pre-aborted signal rejects and registers nothing; an abort during option
conversion registers nothing; re-registers a name after its signal aborts; fires
`toolchange` for registry mutations.

**Discovery and execution** — native-shaped `getTools`; strict, sorted metadata;
rejects cross-document discovery; executes registered tool objects from `getTools`;
rejects opaque origins and disabled origin isolation; fires producer `toolchange` and
`ontoolchange`; keeps the `ontoolchange` listener position when replaced; re-adds it
after other listeners when cleared; handles a synchronous `execute`; falls back to
string conversion for a non-serializable result.

**Access** — rejects registration, discovery and execution from a detached document;
rejects when Permissions Policy disables WebMCP; rejects untrustworthy cross-origin
options with `SecurityError`.

**Cleanup** — leaves pre-existing descriptors alone when init no-ops; removes installed
document and navigator surfaces after a full install; detaches registration lifetimes;
restores a pre-existing global `ModelContext` descriptor.

**Descriptor validation** — not an object; empty name; WebIDL string coercion; empty
description; symbols rejected; `_ . -` accepted; exactly 128 chars accepted; `execute`
not a function; `inputSchema` not an object; omits schema metadata when none; preserves
schemas without a root type; Standard Schema only for MCP-B consumers; circular
schema rethrows; `toJSON` returning `undefined` rejects; `toJSON` errors rethrown;
non-object `toJSON` output omits the member.

**Testing shim** — `listTools` empty / populated / preserves empty schema;
`executeTool` unknown tool / JSON array / preserves abort reason / rethrows /
serializes without interpreting MCP fields; `ontoolchange` fires; re-added after
listeners; preserves an abort reason on cancellation.

**Forms** — user submissions unattributed without a running tool; agent submission
attributed and settled from the observed root.

## Re-checking

```bash
cd ~/myGitHub/npm-packages && git fetch --depth 1 origin main && git log -1 --format='%h %ad' --date=short origin/main
cd packages/webmcp-polyfill && node -e "console.log(require('./package.json').version)"
grep -o "^\s*\(describe\|it\)(['\"][^'\"]*" src/index.test.ts | wc -l
```

If the version moves, re-read `src/index.ts` against [chapters 1–3](./01-install-and-cleanup.md)
first — that is where every behaviour in the first table comes from.

---

[← back to contents](./README.md)
