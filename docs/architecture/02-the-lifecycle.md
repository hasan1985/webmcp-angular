[← what WebMCP is](./01-what-webmcp-is.md) · [contents](./README.md) · next: [Anatomy of a call →](./03-anatomy-of-a-call.md)

# 2. The lifecycle

This is the chapter that explains why Angular's integration is so small. Once you
see this, the rest follows.

## The thing that surprises everyone

The spec has **no `unregisterTool`**. Look at the whole interface again:

```ts
interface ModelContext extends EventTarget {
  registerTool(tool, options?): Promise<void>;
  getTools(options?): Promise<RegisteredTool[]>;
  executeTool(tool, inputObject?, options?): Promise<string>;
  ontoolchange: ((event: Event) => unknown) | null;
}
```

There is no remove. So how does a tool ever go away?

Through the `AbortSignal` you passed when you registered it:

```ts
interface ModelContextRegisterToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}
```

**Aborting that signal *is* unregistration.** That is the entire removal mechanism.

```
   registerTool(tool, {signal})
            │
            │   tool is live, agents can see and call it
            │
            ▼
      signal.abort()
            │
            ▼
   tool is gone from getTools(), calls fail
```

## Why that is good news for Angular

Angular already has a teardown primitive with exactly this shape: `DestroyRef`. Every
injector has one, and it fires when the injector is destroyed.

So the two lifetimes compose directly — no bookkeeping, no registry, no cleanup
service:

```
   ┌────────────────┐        ┌──────────────────┐        ┌─────────────────┐
   │   DestroyRef   │        │ AbortController  │        │   registerTool  │
   │                │        │                  │        │                 │
   │  .onDestroy()  │───────►│    .abort()      │───────►│    {signal}     │
   └────────────────┘        └──────────────────┘        └─────────────────┘
      Angular's                    the adapter                the spec's
      idea of "gone"                                       idea of "gone"
```

Read as a sentence: *when the injector dies, abort the controller; the browser sees
the abort and drops the tool.*

That is the whole integration. Everything else — providers, scopes, route behaviour —
is a consequence of **which injector** you attach to.

## The real implementation

Here is `@angular/core@22.1.6`, near enough verbatim. It is worth reading in full
because there is nothing hidden:

```js
async function declareWebMcpTool(tool, injector) {
  if (typeof ngServerMode !== 'undefined' && ngServerMode) return;      // ① SSR: do nothing

  const modelContext = globalThis.document.modelContext
                    ?? globalThis.navigator.modelContext;                // ② find the API
  if (!modelContext || typeof modelContext.registerTool !== 'function') return;  // ③ unsupported: do nothing

  const currentInjector = injector ?? inject(Injector);                  // ④ whose lifetime?
  const destroyRef = currentInjector.get(DestroyRef);
  const abortCtrl = new AbortController();

  const wrappedTool = {
    ...tool,
    execute: (args, client) => {
      const signal = client?.signal                                      // ⑤ compose cancellation
        ? AbortSignal.any([abortCtrl.signal, client.signal])
        : abortCtrl.signal;
      return runInInjectionContext(currentInjector, () =>                // ⑥ inject() works inside
        tool.execute(args, {...client, signal}));
    },
  };

  destroyRef.onDestroy(() => void abortCtrl.abort());                    // ⑦ the chain
  await modelContext.registerTool(wrappedTool, {signal: abortCtrl.signal});
}
```

Seven things worth naming:

① **Server renders do nothing, silently.** No warning, no throw. A `ReferenceError`
here would take down the whole page's server render, not just the tools.

This package checks `typeof document === 'undefined'` at the same spot: the
`ngServerMode` build global is not reliably defined before v22, and the absence of a
document is the same fact seen from the other side. Same outcome — the browser API is
never touched while prerendering
([diagram 8](./07-lifecycle-in-page-agent.md#8-and-on-the-server-nothing-happens)).

② Resolution order is `document` then `navigator` — the latter is the deprecated
Chrome 149 spelling.

③ **Unsupported browsers also do nothing, silently.** Silence is deliberate: a
library that logged on every page in Firefox would be intolerable.

④ Either the injector you passed, or the one you are standing in. This single line is
what makes scoping work.

⑤ `AbortSignal.any([appTeardown, agentCancel])` — **either** the injector being
destroyed **or** the agent giving up cancels the call. Your tool sees one signal and
doesn't care which happened.

⑥ `runInInjectionContext` is why `inject()` works inside `execute`. Without it, every
tool would need its dependencies threaded in by hand.

⑦ The chain from the diagram, in one line.

## The registry is the browser's — even when the agent is yours

Read ③ again. If there is no `document.modelContext`, `declareWebMcpTool` returns.
It keeps no list of its own; there is no `Map` of tools anywhere in Angular. The
browser object *is* the registry, and Angular only wires a lifetime and an injection
context around it.

That answers a question that comes up as soon as an app has only an
[in-page agent](./01-what-webmcp-is.md#two-kinds-of-agent) — a chat panel that calls
the LLM itself, with no browser agent and no extension in the picture: *why do I
still need `document.modelContext`, and therefore the polyfill?* Because without
something at that address, `provideWebMcpTools` registers nothing and your chat's
`getTools()` has nothing to read. The polyfill is not there for the browser's
benefit; it is there because the API you are calling has nowhere else to put a tool.

Three things could sit at that address:

| | Angular's API works unchanged | Native migration stays imports-only | Browser agent and extension can see the tools | Tracks the draft |
|---|---|---|---|---|
| **Native Chrome** | yes | yes | yes | it is the draft |
| **`@mcp-b/webmcp-polyfill`** | yes | yes | yes — native replaces it when present | yes |
| **A shim of your own** (~60 lines: `registerTool`, `getTools`, `executeTool`, `toolchange`) | yes | yes | yes — same, if you install only when absent | freezes at what you wrote |

And one thing that should not: **a registry of your own that is not at
`document.modelContext`** — an Angular service the chat reads from. It would work,
and it removes the polyfill; it also removes every row above. The core would no longer
be Angular's code path, the migration would no longer be an import rewrite, and the
browser's own agent would never see the tools. You would rebuild the lifetime chain,
the injection-context wrapper and a `toolchange` equivalent against your own object,
to arrive at a private copy of this chapter.

So the decision that matters is *the address*, not *who provides the object*. The
polyfill is the default because it tracks the draft — every shape change in
[chapter 6](./06-what-bites-you.md) surfaced through it first — and because it is
optional, lazy-loaded, and steps aside for native. A shim is a reasonable swap for an
app that is certain it will only ever have an in-page agent; the chat's one adapter
file is where the differences would land
([decision 023](../decisions/023-registry-at-document-modelcontext.md)).

## The two registration paths

`provideWebMcpTools` is a thin wrapper over the same function:

```js
function provideWebMcpTools(tools) {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => {
      for (const tool of tools) declareWebMcpTool(tool);   // note: not awaited
    }),
  ]);
}
```

So there are two doors into one room:

```
   provideWebMcpTools([...])        declareWebMcpTool({...})
            │  in a providers array                      │  in a constructor
            │  registers at injector creation            │  registers immediately
            ▼                                            ▼
            └──────────────► the 25 lines above ◄────────┘
                                    │
                                    ▼
                          registerTool({signal})
```

**That un-awaited loop matters.** `declareWebMcpTool` is `async`, and
`registerTool` rejects with `InvalidStateError` on a duplicate name. Because nothing
awaits it, a name collision surfaces as an **unhandled promise rejection** — it does
not throw synchronously and does not fail bootstrap. If you see a stray
`InvalidStateError` in the console and your app otherwise works, that is what it is.

## What this means in practice

| You want a tool to live… | Attach it to… |
|---|---|
| for the whole app | the root injector — `provideWebMcpTools` in `app.config.ts` |
| while a component is on screen | that component — `declareWebMcpTool()` in its constructor |
| while a service exists | that service — same, in its constructor |
| while a route is active | **careful** — see [chapter 4](./04-scope-and-navigation.md) |

The last row is the one that bites, and it gets its own chapter.

---

next: [Anatomy of a tool call →](./03-anatomy-of-a-call.md)
