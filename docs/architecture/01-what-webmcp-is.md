[← back to contents](./README.md) · next: [The lifecycle →](./02-the-lifecycle.md)

# 1. What WebMCP actually is

## The problem it solves

Before WebMCP, an agent driving a web app had exactly one option: pretend to be a
person. Screenshot the page, guess which pixels are a button, click, screenshot
again, hope.

```
    Without WebMCP                      With WebMCP

    ┌─────────┐                         ┌─────────┐
    │  agent  │                         │  agent  │
    └────┬────┘                         └────┬────┘
         │ screenshot                        │ "add_to_cart({sku, qty})"
         ▼                                   ▼
    ┌─────────┐                         ┌──────────────┐
    │ pixels  │  guess where to click   │ your function│  runs your code
    └────┬────┘                         └──────┬───────┘
         │ click (200, 340)                    │
         ▼                                     ▼
    ┌─────────┐                         ┌──────────────┐
    │  page   │  hope it worked         │ CartService  │  returns a real result
    └─────────┘                         └──────────────┘
```

The right-hand side is not just more reliable, it is *cheaper* — no vision model, no
screenshots, and a failure comes back as a sentence you wrote rather than a
misplaced click.

## The API, in full

The entire browser surface is three members on one object:

```ts
document.modelContext.registerTool(tool, {signal?, exposedTo?})  // Promise<void>
document.modelContext.getTools({fromOrigins?})                   // Promise<RegisteredTool[]>
document.modelContext.ontoolchange                               // event handler
```

And a tool is four fields:

```ts
{
  name: string,           // unique per document, [A-Za-z0-9_.-], 1–128 chars
  description: string,    // what the agent reads to decide whether to call it
  inputSchema: {...},     // JSON Schema for the arguments
  execute: (args, client) => unknown,
}
```

That is the whole thing. If it feels small, that is the point — it is deliberately
a thin, form-fitting layer over functions you already have.

## Three misconceptions worth clearing now

### "It's JSON-RPC"

**No.** The W3C draft has **no wire format at all**. `document.modelContext` is a
direct in-page JavaScript API, and the intended consumer is the browser's own agent
running in the same process.

JSON-RPC enters the picture only when you want to reach an agent *outside* the page —
Claude Desktop, Cursor, an extension. That is a separate, non-standard layer
([chapter 5](./05-transports.md)), and it is the vendor `@mcp-b/*` ecosystem, not the
spec.

```
   W3C WebMCP                          MCP-B / bridge
   ──────────                          ──────────────
   document.modelContext               JSON-RPC 2.0 over postMessage
   in-page JS call                     a wire format
   browser's built-in agent            Claude Desktop, Cursor, extensions
   standardised (CG draft)             vendor
```

### "The page can call tools too"

Mostly no. `registerTool` and `getTools` are standard. **`executeTool` is not** — it
lives on an optional Chromium extension interface:

```ts
interface ChromeModelContextExtensions {
  executeTool?(tool, inputArgumentsJson, options?): Promise<string | null>;
}
```

So a page that wants to invoke its own tools (an in-page chat, a devtools panel) must
feature-detect it. `@mcp-b/webmcp-polyfill` provides it, which is why both the
playground's chat and the `/devtools` inspector work at all.

### "Someone validates the arguments"

**Nobody does.** Not the spec, not the browser, not Angular. `inputSchema` is a
*hint to the model*, not a runtime guard. An agent can send you `{square: 99}` for a
field you declared `maximum: 8`, and it will arrive at your `execute` exactly as sent.

This has a design consequence that runs through everything: **validate, and return
the problem as a result rather than throwing.**

```ts
execute: ({square, player}) => {
  const error = store.move(square, player);
  return error
    ? `Move rejected. ${error}`      // ← the agent reads this and tries again
    : `Played ${player} on ${square}.`;
}
```

A thrown exception ends the turn. A described failure lets the agent self-correct:

```
 agent → make_move({square: 4, player: "O"})
       ← "Move rejected. Square 4 is already taken by X.
          Empty squares are: 0, 1, 2, 3, 5, 6, 7, 8."
 agent → make_move({square: 5, player: "O"})        ← it fixed itself
       ← "Played O on square 5."
```

Good error text is not politeness here. It is the control flow.

## Where Angular fits

Three layers, each doing one job:

```
   ┌───────────────────────────────────────────────────────────┐
   │  YOUR APP        CartService, GameStore, …                │
   │                  ↑ knows nothing about WebMCP             │
   ├───────────────────────────────────────────────────────────┤
   │  ANGULAR         provideWebMcpTools(…)        │
   │                  declareWebMcpTool(…)         │
   │                  · ties tool lifetime to an Injector      │
   │                  · runs execute in the injection context  │
   ├───────────────────────────────────────────────────────────┤
   │  BROWSER         document.modelContext.registerTool(…)    │
   │                  the W3C draft                            │
   └───────────────────────────────────────────────────────────┘
```

Angular's entire implementation is **25 lines**. It adds exactly two things to the
browser API — lifetime and injection context — and that turns out to be all the
integration a framework needs. The next chapter is about the first of those.

---

next: [The lifecycle →](./02-the-lifecycle.md)
