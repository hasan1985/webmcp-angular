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

## Two kinds of agent

Before the API: who is on the other end. "Agent" in this course always means one of
two things, and the difference is *where the code that calls your tools runs*.

```
   IN-PAGE AGENT                              EXTERNAL AGENT, VIA THE BROWSER

   ┌─ your page ─────────────────────┐        ┌─ your page ─────────────────────┐
   │                                 │        │                                 │
   │  chat panel ──► LLM API call    │        │  bridge ◄── postMessage ──┐     │
   │      │                          │        │    │                      │     │
   │      ▼                          │        │    ▼                      │     │
   │  document.modelContext          │        │  document.modelContext    │     │
   │      │                          │        │                           │     │
   │      ▼                          │        └───────────────────────────┼─────┘
   │  your tools ──► your services   │                                    │
   └─────────────────────────────────┘             extension content script
                                                            │
                                                   Claude Desktop, Cursor,
                                                   any MCP client
```

**In-page agent.** Your app is the agent. A chat panel you wrote reads the tools
from `document.modelContext`, sends them to an LLM through an API call it makes
itself, runs whatever the model asks for, and shows the answer. Nothing leaves the
page except that API call. This is the main case for most apps, and the playground's
chat. It needs the core and the polyfill, nothing else.

**External agent, via the browser.** The agent lives outside the page — an
extension's content script, Claude Desktop, Cursor — and reaches in. It cannot see
your page's JavaScript, so it speaks MCP over JSON-RPC, and the bridge translates
that into calls on `document.modelContext`. Opt-in: the operator decides whether the
door is open.

A third party, the browser's own agent, sits inside the browser and owns
`document.modelContext` outright; it needs nothing from you beyond registering
tools, and this course mentions it where it matters.

The two arcs get a chapter each — [7](./07-lifecycle-in-page-agent.md) and
[8](./08-lifecycle-external-agent.md) — and the guide's
[chapter 5](../guide/05-in-page-agent.md) and [chapter 6](../guide/06-external-agents.md)
build one of each. Everything between here and there is common to both.

## The API, in full

The entire browser surface is four members on one object:

```ts
document.modelContext.registerTool(tool, {signal?, exposedTo?})   // Promise<void>
document.modelContext.getTools({fromOrigins?})                    // Promise<RegisteredTool[]>
document.modelContext.executeTool(tool, inputObject?, {signal?})  // Promise<string>
document.modelContext.ontoolchange                                // event handler
```

And a tool is four fields you always write, plus two you sometimes do:

```ts
{
  name: string,           // unique per document, [A-Za-z0-9_.-], 1–128 chars
  description: string,    // what the agent reads to decide whether to call it
  inputSchema: {...},     // JSON Schema for the arguments
  execute: (args, client) => unknown,

  title?: string,         // for display in the browser's own UI; defaults to ''
  annotations?: {         // hints for the agent; each defaults to false
    readOnlyHint, untrustedContentHint, consequentialHint,
  },
}
```

Angular's `WebMcpToolDescriptor` types the first four; the browser accepts all six.
That is the whole thing. If it feels small, that is the point — it is deliberately
a thin, form-fitting layer over functions you already have.

### Who calls which

Two parties, and it pays to keep them apart from the start. **Your page** calls
`registerTool`. An **agent harness** calls `getTools` and `executeTool` — for an
in-page agent that harness is your chat panel; for an external agent it is the
bridge, on the MCP client's behalf. The **model** behind either harness is handed the
tool list as text and answers with a tool name and arguments; it never touches the
object. [Chapter 7](./07-lifecycle-in-page-agent.md#2-a-user-asks-the-agent-to-do-something)
draws harness and model apart.

The draft also has a declarative path — an annotated `<form>` becomes a tool — which
Angular exposes as `provideExperimentalWebMcpForms`. This course is about the
imperative API.

## Four things to understand before writing a tool

### There is no wire format

`document.modelContext` is a direct in-page JavaScript API. A tool is a function on an
object; calling it is a function call, in the same process, with no serialization
between the caller and your code. The draft's intended consumer is the browser's own
agent, and an in-page agent uses it the same way.

JSON-RPC enters the picture when an agent *outside* the page — Claude Desktop,
Cursor, an extension — needs to reach in. That is a separate layer built by the
`@mcp-b/*` ecosystem ([chapter 5](./05-transports.md)), and the bridge is this
package's implementation of it.

```
   W3C WebMCP                          MCP-B / bridge
   ──────────                          ──────────────
   document.modelContext               JSON-RPC 2.0 over postMessage
   in-page JS call                     a wire format
   browser's built-in agent            Claude Desktop, Cursor, extensions
   standardised (CG draft)             vendor
```

### The page can call its own tools

It can — with one caveat about shape. `executeTool` began as a Chromium extension
outside the draft; the draft has since taken it into the `ModelContext` interface,
where it takes the tool and an **object** of arguments. The implementations you can
run today — Chrome's origin trial, `@mcp-b/webmcp-polyfill`, and the
`@mcp-b/webmcp-types@5.1.0` typings Angular vendors — carry the earlier shape, which
takes a **JSON string**:

```ts
// the draft                                  // Chrome, polyfill, types 5.1.0
executeTool(tool, {square: 4}, {signal})      executeTool(tool, '{"square":4}', {signal})
```

So a page that invokes its own tools (an in-page chat, a devtools panel)
feature-detects `executeTool` and serializes arguments in one place, so the day an
implementation switches to the draft's shape there is one line to change. The polyfill
is what makes the playground's chat and the `/devtools` inspector work today.

### Validation is yours

`inputSchema` is a *hint to the model*. The only check on the arguments is the one
you write in `execute`: an agent can send `{square: 99}` for a field you declared
`maximum: 8`, and it arrives exactly as sent, through the browser and through Angular.

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

### How agents find your tools

The browser's own agent finds them itself. `registerTool` writes into an object the browser owns,
and the draft (§5.2) describes the rest: the browser agent takes an *observation* of
the tab — every document's tool map, tagged with its origin — and reads the tools out
of it. The user opening your page is the whole connection step.

Every other agent is brought to the page by something outside the draft: an in-page
chat you wrote, or an extension the user installed that probes for
`document.modelContext` and talks to it over `postMessage`. The draft has no meta
tag, header or manifest by which a page announces it has tools, so an agent outside
the browser learns about them only by running code inside the page.
[Chapter 9](./09-will-this-be-standardised.md#the-discovery-gap)
works through what that means for each kind of agent.

## Where Angular fits

Three layers, each doing one job:

```
   ┌───────────────────────────────────────────────────────────┐
   │  YOUR APP        CartService, GameStore, …                │
   │                  ↑ knows nothing about WebMCP             │
   ├───────────────────────────────────────────────────────────┤
   │  ANGULAR         provideWebMcpTools(…)                    │
   │                  declareWebMcpTool(…)                     │
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
