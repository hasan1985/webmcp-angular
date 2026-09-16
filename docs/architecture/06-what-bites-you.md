[← getting tools out of the page](./05-transports.md) · [contents](./README.md)

# 6. What bites you

Nine things this project got wrong, then measured. Each one cost real debugging time,
and none of them announce themselves — the failure mode for most is *silence*.

Use this as a symptom index.

---

## 1. Nothing validates the agent's arguments

**Symptom:** a tool receives `{square: 99}` for a field declared `maximum: 8`, or a
string where you declared a number.

Not the spec, not the browser, not Angular. `inputSchema` is a hint to the model, not
a runtime guard.

**Do:** validate in `execute`, and return the problem as text so the agent can
self-correct. Never trust the shape.

---

## 2. Duplicate tool names are an unhandled rejection, not a throw

**Symptom:** a stray `InvalidStateError` in the console; the app works; one of your
tools is missing.

`provideWebMcpTools` does not await its registrations:

```js
for (const tool of tools) declareWebMcpTool(tool);   // no await
```

so a collision rejects into nowhere. Bootstrap succeeds, the second tool is simply
absent.

**Do:** namespace tool names if you have multiple feature areas or micro-frontends.
Names are globally unique **per document**, not per module. Also watch for a component
that renders twice at once — two instances, two registrations, one collision.

---

## 3. Route-level `providers` leak before Angular 22

**Symptom:** tools from a page you left are still in the list.

Measured in Chrome on Angular 20.3.31:

| Registered via | After navigating away |
|---|---|
| Route `providers` | **still registered** |
| Component constructor | correctly gone |

**Do:** declare page-scoped tools in the routed component. On v22 you may instead use
`provideRouter(routes, withExperimentalAutoCleanupInjectors())`. See
[chapter 4](./04-scope-and-navigation.md).

---

## 4. `executeTool` is not standard

**Symptom:** `document.modelContext.executeTool is not a function` — usually in an
in-page chat or a devtools panel.

Only `registerTool`, `getTools` and `ontoolchange` are in the W3C draft. `executeTool`
is on an optional Chromium extension interface.

**Do:** feature-detect it, and say something useful when it is missing. The polyfill
provides it, which is why in-page invocation works in development.

---

## 5. `inputSchema` comes back in two different shapes

**Symptom:** `tools[0].inputSchema.properties` is `undefined`, but only on some
Chrome builds.

`getTools()` returns `inputSchema` as a **serialized JSON string** on Chrome 149–153
— most of the current origin-trial population — and as an **object** from Chrome
154.0.8013 onward ([webmcp#241](https://github.com/webmachinelearning/webmcp)).

**Do:** branch on `typeof` and guard the parse:

```ts
let value = tool.inputSchema;
if (typeof value === 'string') {
  try { value = JSON.parse(value); } catch { value = null; }
}
```

Only affects code *reading* tools back. Registration is unaffected.

---

## 6. `title` defaults to `''`, so `??` does not save you

**Symptom:** blank labels in a tool list.

The spec defaults `title` to the empty string rather than omitting it. `??` only falls
through on `null`/`undefined`.

**Do:** `tool.title || tool.name`.

---

## 7. `file:` installs break secondary entry points

**Symptom:** `TS7031: Binding element 'square' implicitly has an 'any' type` on tool
arguments, with nothing pointing at the cause.

`npm i file:../some/dist` creates a **symlink**. TypeScript resolves symlinks to their
real path, so a secondary entry point importing the primary entry *by package name*
cannot find it — and with `skipLibCheck` on (the Angular CLI default) the resolution
failure is silent. The types degrade to `any`.

**Do:** test against a packed tarball, which installs as a real directory:

```bash
cd dist/your-lib && npm pack --pack-destination /tmp
cd ../../consumer && npm i /tmp/your-lib-0.0.1.tgz
```

---

## 8. `toolchange` does not fire where the spec says it does

**Symptom:** your tool list never refreshes on a polyfilled page — but `getTools()`
returns correct results whenever you ask.

The spec dispatches `toolchange` on the **document**. `@mcp-b/webmcp-polyfill` 5.1.0
dispatches it **only on the ModelContext object**. Measured in Chrome across route
changes:

| Listener | Times called |
|---|---|
| `document.addEventListener('toolchange', …)` | **0** |
| `modelContext.addEventListener('toolchange', …)` | 4 |
| `modelContext.ontoolchange = …` | 4 |

**Do:** listen on both.

```ts
document.addEventListener('toolchange', handler);
document.modelContext?.addEventListener?.('toolchange', handler);
```

> **The wider lesson.** This bug survived 20 passing tests, because the test fake
> dispatched on *both* targets — faithful to the spec, and therefore **more generous
> than the real implementation**. A fake more capable than reality hides exactly this
> class of bug. Anything that depends on *where* an event fires, or on
> `event.origin` / `event.source`, cannot be trusted from jsdom.

---

## 9. Heterogeneous tool schemas do not type-check in one array

**Symptom:** `Type '["square","player"]' is not assignable to type '[]'` from a
`provideWebMcpTools([...])` call.

`provideWebMcpTools<const S>(tools: WebMcpToolDescriptor<S>[])` has one
type parameter for the whole array, so every tool in a single call must share one
schema type. Tools with different schemas have no valid `S`
([angular#70125](https://github.com/angular/angular/issues/70125), still open).

**Do:** one call per tool — each array stays homogeneous and it all type-checks with
no casts.

```ts
provideWebMcpTools([getBoardTool]),
provideWebMcpTools([makeMoveTool]),
```

The alternative you will see elsewhere, `as unknown as WebMcpToolDescriptor<never>[]`,
compiles but throws away the typing that made writing a schema worthwhile.

---

## A debugging checklist

When a tool is not behaving, in order:

1. **Is it registered?** `await document.modelContext.getTools()` in the console.
2. **If not** — did registration throw? Look for `InvalidStateError` (#2). Is
   `document.modelContext` even there? Is this a server render?
3. **Did it vanish?** Something destroyed its injector. Which injector did you attach
   to (#3, [chapter 4](./04-scope-and-navigation.md))?
4. **Is it there twice?** A component rendering twice concurrently, or two features
   choosing the same name (#2).
5. **Does calling it throw `NG0203`?** Something is calling `execute` directly instead
   of going through `executeTool`, skipping `runInInjectionContext`.
6. **Does the agent keep misusing it?** That is a `description` problem, not a code
   problem. Say what the numbers mean and what the failure modes are.

---

next: [The full sequence →](./07-lifecycle-sequence.md) — every exchange on one
timeline, which is often the fastest way to see where an ordering went wrong.

[← back to contents](./README.md)
