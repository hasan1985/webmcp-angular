[← getting tools out of the page](./05-transports.md) · [contents](./README.md) · next: [The full sequence: in-page agent →](./07-lifecycle-in-page-agent.md)

# 6. What bites you

Eight things that cost anyone using WebMCP from Angular real debugging time, each checked against source
or measured. None of them announce themselves — the failure mode for most is
*silence*.

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

## 3. Route-level `providers` leak, unless you opt in to cleanup

**Symptom:** tools from a page you left are still in the list.

Measured in Chrome on Angular 20.3.31:

| Registered via | After navigating away |
|---|---|
| Route `providers` | **still registered** |
| Component constructor | correctly gone |

The router destroys route-level environment injectors only with
`withExperimentalAutoCleanupInjectors()`, which `@angular/router` ships from
**21.1.0** (verified: absent in 21.0.0, present in 21.1.0 and 22). On 20.x and 21.0
there is no such feature.

**Do:** declare page-scoped tools in the routed component — works on every version.
On 21.1+ you may instead add the router feature. See
[chapter 4](./04-scope-and-navigation.md#the-trap-route-level-providers).

---

## 4. `executeTool` comes in two shapes, and is sometimes absent

**Symptom:** `document.modelContext.executeTool is not a function` — usually in an
in-page chat or a devtools panel. Or a shape mismatch: passing an *object* to today's
implementations fails with `UnknownError: Failed to parse input arguments` (WebIDL
turns it into the string `[object Object]` first); passing a JSON *string* to an
implementation with the draft's shape hands your tool a string where it expected an
object.

`executeTool` started as an optional Chromium extension, and the draft has since
adopted it into `ModelContext` — taking an **object** of arguments, where Chrome's
origin trial, `@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-types@5.1.0` all take a
**JSON string** (the polyfill's parser is literally named `parseChromeToolInput`).
Today's implementations have the string shape; the draft has the object shape; an
implementation may also have neither.

**Do:** feature-detect it, invoke it from one place, and keep the argument
serialization there, so that switching shape is a one-line change. The bridge and the
devtools panel both go through a single call site.

---

## 5. `inputSchema` comes back in two different shapes

**Symptom:** `tools[0].inputSchema.properties` is `undefined`, but only on some
Chrome builds.

`getTools()` returned `inputSchema` as a **serialized JSON string** until
[webmcp#241](https://github.com/webmachinelearning/webmcp/pull/241) changed it to an
**object**. Chrome rolls that out from 154.0.8013, cross-document tools first; the
origin-trial builds (149–156) still return the string for same-document tools, and the
polyfill returns the object. Both generations are in the wild at once.

**Do:** branch on `typeof` and guard the parse:

```ts
let value = tool.inputSchema;
if (typeof value === 'string') {
  try { value = JSON.parse(value); } catch { value = null; }
}
```

Only affects code *reading* tools back. Registration is unaffected.

---

## 6. `title` comes back as `''`, so `??` does not save you

**Symptom:** blank labels in a tool list.

Chrome and the polyfill return `title: ''` for a tool registered without one. The
draft leaves the unset value to the implementation, and
[webmcp#224](https://github.com/webmachinelearning/webmcp/issues/224) — still open —
asks whether it should be omitted instead. `??` only falls through on
`null`/`undefined`.

**Do:** `tool.title || tool.name`.

---

## 7. `toolchange` fires at the ModelContext, not the document

**Symptom:** your tool list never refreshes on a polyfilled page — but `getTools()`
returns correct results whenever you ask.

The draft fires `toolchange` at the document's **`ModelContext`** object —
`ontoolchange` is an attribute of that interface — and `@mcp-b/webmcp-polyfill` 5.1.0
does the same. This project's first bridge listened on the **document**. Measured in
Chrome across route changes:

| Listener | Times called |
|---|---|
| `document.addEventListener('toolchange', …)` | **0** |
| `modelContext.addEventListener('toolchange', …)` | 4 |
| `modelContext.ontoolchange = …` | 4 |

**Do:** listen on the ModelContext. The library attaches to both targets — the
ModelContext because that is where it fires, the document as a no-cost hedge against
an implementation that also dispatches there.

```ts
document.modelContext?.addEventListener?.('toolchange', handler);
document.addEventListener('toolchange', handler);
```

> **The wider lesson.** This bug survived 20 passing tests, because the test fake
> dispatched on *both* targets, so a listener on the wrong one still fired. A fake
> more capable than reality hides exactly this class of bug. Anything that depends on
> *where* an event fires, or on `event.origin` / `event.source`, cannot be trusted
> from jsdom.

---

## 8. Heterogeneous tool schemas do not type-check in one array

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

next: [The full sequence →](./07-lifecycle-in-page-agent.md) — every exchange on one
timeline, which is often the fastest way to see where an ordering went wrong.

[← back to contents](./README.md)
