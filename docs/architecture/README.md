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
an agent reads and invokes them — either an **in-page agent**, a chat panel you wrote
that calls the LLM itself, or an **external agent** reaching in through the browser,
such as Claude Desktop behind an extension. Angular's contribution is small
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
| 1 | [What WebMCP actually is](./01-what-webmcp-is.md) | The two kinds of agent, the browser API, and four things to understand before writing a tool |
| 2 | [The lifecycle](./02-the-lifecycle.md) | `DestroyRef → AbortController → registerTool`, the idea the whole integration rests on |
| 3 | [Anatomy of a tool call](./03-anatomy-of-a-call.md) | What happens between an agent's request and your service, step by step |
| 4 | [Scope and navigation](./04-scope-and-navigation.md) | App, route and component scope — and the one that leaks |
| 5 | [Getting tools out of the page](./05-transports.md) | Native, polyfill, and the JSON-RPC bridge to desktop MCP clients |
| 6 | [What bites you](./06-what-bites-you.md) | Eight things measured the hard way, with the evidence |
| 7 | [The full sequence: in-page agent](./07-lifecycle-in-page-agent.md) | Every exchange on one timeline when your app is the agent — page load, session start, a request end to end, navigation, cancellation, teardown |
| 8 | [The full sequence: external agent](./08-lifecycle-external-agent.md) | The same arc when the agent reaches in from outside — opening the door, the extension's probe, a session over JSON-RPC, keeping the client current, closing the door |
| 9 | [Will this be standardised?](./09-will-this-be-standardised.md) | Where the three engines actually stand, and what it means for code you write today |
| 10 | [Inside the polyfill](./10-inside-the-polyfill.md) | `@mcp-b/webmcp-polyfill` read from source — install, the registry, `executeTool`, access checks, declarative forms — and which of its behaviours this package is built around |

If you only read two, read **2** and **7** — or **8** if your agent lives outside the page. If you prefer to see the whole thing at
once before reading any of it, start with **7**.

## Also here

**[`visual-guide.html`](./visual-guide.html)** — the same material as a single
diagrammed page, published at
<https://claude.ai/code/artifact/190f4737-c9ea-4892-aa2b-f9c854716f83>. Seven SVG
figures on one consistent colour key: amber for your code, crimson for Angular, blue
for the browser, green for the agent. It covers chapters 1–7; chapters 8–10
are text and mermaid only. Read that one if you think in pictures; read the chapters if
you want the sources.

**[`../polyfill/`](../polyfill/README.md)** — `@mcp-b/webmcp-polyfill` read from its
source, six short chapters: install, the registry, `executeTool`, validation and
access, declarative forms, and what each behaviour means for this package. Chapter 10
here is its summary.

## Two ways to use this

**Learning the model?** Read chapters 1–4 in order. They build on each other and
assume nothing beyond ordinary Angular.

**Debugging something?** Chapter 6 is a symptom index. Most WebMCP problems are one
of: a tool that never registered, a tool that registered twice, or a tool that
registered and then silently went away.

## A note on stability

WebMCP is a **W3C Community Group draft**, and Angular's support is marked
`@experimental` — the API may change outside a major version. The shape taught here
is accurate as of `@angular/core@22.1.6`, Chrome 150–154, and the draft as of
16 September 2026. Chapters 6 and 9 list the places it has already moved.

It is also contested: Chromium is implementing, Mozilla is **neutral**, and WebKit has
formally recorded **oppose**. [Chapter 9](./09-will-this-be-standardised.md) works
through what that means for code you write today — short version: this package does
not depend on the outcome, but you should know the odds before you lean on it.
