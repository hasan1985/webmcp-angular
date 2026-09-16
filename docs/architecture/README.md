# Angular WebMCP, explained

A short course on how WebMCP works, how Angular wires into it, and where the sharp
edges are.

Everything here is verified against real sources: `@angular/core@22.1.6`'s shipped
`.d.ts` and `fesm2022` build, the W3C draft, `@mcp-b/webmcp-types@5.1.0`, and Chrome.
Where something was *measured* rather than read, it says so.

## The one-paragraph version

WebMCP lets a web page hand an AI agent a set of **typed, callable functions**
instead of making it guess at your UI. The page calls
`document.modelContext.registerTool({name, description, inputSchema, execute})`, and
an agent can then discover and invoke those tools. Angular's contribution is small
but exactly right: it ties a tool's lifetime to an **injector**, so tools appear and
disappear with the parts of your app that own them, and it runs `execute` inside the
**injection context**, so a tool is a thin wrapper over services you already have.

```
      ┌──────────────┐   "add a milk to my cart"
      │  AI agent    │ ─────────────────────────────┐
      └──────────────┘                              │
                                                    ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Your page                                                 │
   │                                                            │
   │   document.modelContext ──► add_to_cart ──► CartService    │
   │                             (a tool)        (already       │
   │                                              existed)      │
   └────────────────────────────────────────────────────────────┘
```

The agent never touches the DOM. It calls a function you wrote.

## Read in this order

| # | Chapter | What you get |
|---|---|---|
| 1 | [What WebMCP actually is](./01-what-webmcp-is.md) | The browser API, and the three misconceptions worth clearing first |
| 2 | [The lifecycle](./02-the-lifecycle.md) | `DestroyRef → AbortController → registerTool`, the idea the whole integration rests on |
| 3 | [Anatomy of a tool call](./03-anatomy-of-a-call.md) | What happens between an agent's request and your service, step by step |
| 4 | [Scope and navigation](./04-scope-and-navigation.md) | App, route and component scope — and the one that leaks |
| 5 | [Getting tools out of the page](./05-transports.md) | Native, polyfill, and the JSON-RPC bridge to desktop MCP clients |
| 6 | [What bites you](./06-what-bites-you.md) | Nine things measured the hard way, with the evidence |
| 7 | [The full sequence](./07-lifecycle-sequence.md) | Every exchange on one timeline — page load, calls, navigation, cancellation, teardown |
| 8 | [Will this be standardised?](./08-will-this-be-standardised.md) | Where the three engines actually stand, and what it means for code you write today |

If you only read two, read **2** and **6**. If you prefer to see the whole thing at
once before reading any of it, start with **7**.

## Also here

**[`visual-guide.html`](./visual-guide.html)** — the same material as a single
diagrammed page, published at
<https://claude.ai/code/artifact/190f4737-c9ea-4892-aa2b-f9c854716f83>. Seven SVG
figures on one consistent colour key: amber for your code, crimson for Angular, blue
for the browser, green for the agent. Read that one if you think in pictures; read the
chapters if you want the sources.

## Two ways to use this

**Learning the model?** Read chapters 1–4 in order. They build on each other and
assume nothing beyond ordinary Angular.

**Debugging something?** Chapter 6 is a symptom index. Most WebMCP problems are one
of: a tool that never registered, a tool that registered twice, or a tool that
registered and then silently went away.

## A note on stability

WebMCP is a **W3C Community Group draft**, and Angular's support is marked
`@experimental` — the API may change outside a major version. The shape taught here
is accurate as of `@angular/core@22.1.6` and Chrome 150–154. Chapter 6 lists the
places it has already moved.

It is also contested: Chromium is implementing, Mozilla is **neutral**, and WebKit has
formally recorded **oppose**. [Chapter 8](./08-will-this-be-standardised.md) works
through what that means for code you write today — short version: this package does
not depend on the outcome, but you should know the odds before you lean on it.
