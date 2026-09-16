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
