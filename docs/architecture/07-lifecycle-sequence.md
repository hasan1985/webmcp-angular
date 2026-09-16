[← what bites you](./06-what-bites-you.md) · [contents](./README.md)

# 7. The full sequence

Every exchange between your app, the browser, and an agent — from the page loading to
the tab closing.

The earlier chapters explain each mechanism in isolation. This one puts them on one
timeline, which is usually what you need when something happens in the wrong order.

**Participants**, consistent across every diagram below:

| | |
|---|---|
| **Agent** | whatever is calling your tools: the browser's own agent, an in-page chat, or an external MCP client. Really a *harness* plus a *model* — only the harness touches the page, and [diagram 2](#2-a-user-asks-the-agent-to-do-something) splits them |
| **modelContext** | `document.modelContext` — native or polyfill |
| **webmcp-angular** | `declareWebMcpTool` / `provideWebMcpTools` and the adapter |
| **Injector** | the Angular injector that owns a tool's lifetime |
| **Your service** | `CartService`, `GameStore` — knows nothing about WebMCP |

---

## 1. Page load and registration

```mermaid
sequenceDiagram
    autonumber
    participant Page as Page (main.ts)
    participant Poly as polyfill
    participant NG as Angular bootstrap
    participant Lib as webmcp-angular
    participant MC as document.modelContext

    Page->>Poly: installWebMcpPolyfill()
    alt browser has native WebMCP
        Poly-->>Page: 'native' (nothing installed)
    else no native support
        Poly->>MC: install document.modelContext
        Poly-->>Page: 'polyfill'
    end

    Note over Page,Poly: Must finish BEFORE bootstrap —<br/>tools register during it.

    Page->>NG: bootstrapApplication(App, appConfig)
    NG->>Lib: environment initializer runs
    Lib->>Lib: new AbortController()
    Lib->>Lib: destroyRef.onDestroy(() => abort())
    Lib->>MC: registerTool(tool, { signal })
    MC-->>Lib: Promise<void>
    MC->>MC: dispatch 'toolchange'
    Note over Lib,MC: Not awaited by provideWebMcpTools —<br/>a duplicate name rejects into nowhere.
```

**If the polyfill loses this race**, `registerTool` is never reached: the adapter
finds no `document.modelContext`, returns early, and says nothing. You get a working
app with no tools and no error. That is the single most common setup mistake.

## 2. A user asks the agent to do something

`getTools()` is not something an agent does on a timer. It reads the list because a
**user asked it for something** and it needs to know what this page can do.

Here is the whole arc, end to end:

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Harness as Agent harness
    participant Model
    participant MC as document.modelContext
    participant App as Your app

    Note over MC,App: Tools registered during bootstrap — diagram 1.

    User->>Harness: "add two blue shirts to my cart"
    Harness->>MC: getTools()
    MC-->>Harness: [ search_products, add_to_cart, get_cart, … ]
    Harness->>Model: the request, plus the tool list

    Note over Model: Picks by name + description.<br/>It never sees the page.
    Model-->>Harness: call add_to_cart({"sku":"SHIRT-BL-M","qty":2})

    Harness->>MC: executeTool(add_to_cart, …)
    MC->>App: execute(args, { signal })
    App-->>MC: "Added 2 × SHIRT-BL-M. Cart now has 2 items."
    MC-->>Harness: (same text)

    Harness->>Model: tool result
    Model-->>Harness: "Added two blue shirts — your cart has 2 items."
    Harness->>User: (same)
```

### The two halves of an "agent"

Elsewhere in this chapter *Agent* is one lane. Here it is split, because this is
exactly where the confusion lives:

- **The harness** is ordinary code — a browser feature, your chat component, an MCP
  client. It is the only half that touches `document.modelContext`: it calls
  `getTools()` (step 2) and `executeTool()` (step 6).
- **The model** never sees the page and never calls anything. It is *handed* the tool
  list (step 4) and replies with a name and arguments (step 5). Tool-calling is a
  feature of the model API, not of WebMCP.

So "how does the model know to call `getTools()`?" has no answer — it never does. The
harness reads the list and passes it in.

Step 2 happens **because of step 1**, a user asking for something, not on a schedule.

Everything the model knows about your app is the text you wrote — step 5 is a choice
made purely from `name` and `description`, which is why
[descriptions matter](../guide/02-writing-tools.md#write-descriptions-for-someone-who-cant-see-your-ui).

Steps 6–9 are the tool call itself. [Diagram 3](#3-inside-a-tool-call) zooms into them.

### How the agent got here

Step 2 is doing real work, and the spec does not define it.

WebMCP describes registration and discovery, then says *"an agent connected to the
page queries the browser to discover the active list of tools."* **How it came to be
connected is out of scope.** There is no meta tag, no HTTP header, no manifest, no
well-known URL — nothing a page can publish to announce "I have tools."

In practice each kind of agent solves it differently:

| | How it knows |
|---|---|
| **The browser's built-in agent** | Nothing to discover — it *is* the browser. `registerTool()` writes into an object the browser owns, so it sees your tools the moment you register them, and `toolchange` when they change. |
| **In-page code** — a chat panel, the inspector | Feature detection: does `document.modelContext` exist? That is all `isWebMcpSupported()` does. |
| **An extension or external MCP client** | A content script probes `document.modelContext` in the page, and/or performs a handshake the *transport* defines — the bridge answers `mcp-check-ready` with `mcp-server-ready` ([diagram 7](#7-reaching-an-agent-outside-the-page)). None of that is in the WebMCP spec; it is `@mcp-b`'s convention. |

So the answer to "how does an agent know this page is WebMCP-enabled" is: **the
browser already knows, and everyone else asks.**

This matters when you are building the agent side. If you are only *exposing* tools,
it costs you nothing — you register, and whoever is looking will find them.

### The same arc, for the three kinds of agent

Who plays the *Agent* lane changes where the trigger comes from, but not the shape:

| | Trigger for `getTools()` | Notes |
|---|---|---|
| **The browser's built-in agent** | the user asks it something, in the browser's own UI | you never see the read; the first thing your app observes is step 7 |
| **In-page code** — a chat panel, the inspector | the user sends a message, or opens the panel | you write this, so you choose the moment |
| **An external MCP client** — Claude Desktop, Cursor | the client's own `tools/list`, through [the bridge](#7-reaching-an-agent-outside-the-page) | refreshed when you push `notifications/tools/list_changed` |

### Cadence, when you control the agent

An in-page chat is the case you write yourself, so the cadence is your decision.
**Once per user turn** is the right one:

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Chat as In-page chat
    participant MC as document.modelContext
    participant LLM as Messages API

    User->>Chat: "add two blue shirts"
    Chat->>MC: getTools()
    MC-->>Chat: the list, as it is right now
    Chat->>LLM: messages + tools
    Note over Chat,LLM: The Messages API is stateless,<br/>so tools travel on every request.
    LLM-->>Chat: tool_use
    Chat->>MC: executeTool(…)
    MC-->>Chat: result
    Chat->>LLM: messages + tool_result + tools
    LLM-->>Chat: final answer
```

Per turn, because the list is live: the user may have navigated since their last
message and gained or lost tools (diagram 5). Not again between the tool calls
*within* a turn — it cannot change mid-turn, so that would be waste.

### Keeping a long-lived consumer current

Something that holds the list across turns — a panel, a connected MCP client —
listens for `toolchange` and refetches:

```ts
const refresh = () => { /* getTools() again */ };

document.addEventListener('toolchange', refresh);
document.modelContext?.addEventListener?.('toolchange', refresh);   // ← both
```

Listen on both targets. The spec dispatches on the document; the polyfill dispatches
only on the ModelContext ([chapter 6 §8](./06-what-bites-you.md)).

## 3. Inside a tool call

Steps 6–9 of diagram 2, with the machinery that sits between the browser and your
service.

```mermaid
sequenceDiagram
    autonumber
    participant Agent
    participant MC as document.modelContext
    participant Lib as webmcp-angular wrapper
    participant Inj as Injector
    participant Svc as Your service

    Agent->>MC: executeTool(get_cart, "{}")
    MC->>Lib: execute({}, { signal })
    Lib->>Lib: AbortSignal.any([injectorTeardown, agentSignal])
    Lib->>Inj: runInInjectionContext(injector, …)
    Inj->>Svc: inject(CartService).describe()
    Svc-->>Inj: "2 items, total £38.00"
    Inj-->>Lib: return value
    Lib-->>MC: unknown (serialized)
    MC-->>Agent: "2 items, total £38.00"
```

Two things happen in the wrapper that make the whole integration work:
`runInInjectionContext` is why `inject()` works inside `execute`, and
`AbortSignal.any` merges the agent's cancellation with the injector's teardown so
your tool only has to watch one signal.

## 4. A mutating call that gets rejected, then retried

This is the loop that makes agents useful, and it only works if you
[return failures as text](../guide/02-writing-tools.md#validate-everything).

```mermaid
sequenceDiagram
    autonumber
    participant Agent
    participant MC as document.modelContext
    participant Lib as webmcp-angular wrapper
    participant Svc as GameStore

    Agent->>MC: executeTool(make_move, {"square":4,"player":"O"})
    MC->>Lib: execute(args, { signal })
    Lib->>Svc: move(4, 'O')
    Svc-->>Lib: "Square 4 is already taken by X."
    Lib-->>MC: "Move rejected. Square 4 is already taken by X.<br/>Empty squares are: 0, 1, 2, 3, 5, 6, 7, 8."
    MC-->>Agent: (same text)

    Note over Agent: Reads the failure. Picks a legal square.

    Agent->>MC: executeTool(make_move, {"square":5,"player":"O"})
    MC->>Lib: execute(args, { signal })
    Lib->>Svc: move(5, 'O')
    Svc-->>Lib: ok
    Lib-->>MC: "Played O on square 5.<br/>Board: …  Status: it is X's turn."
    MC-->>Agent: (same text)
```

Had the tool **thrown** instead, the turn would have ended there. The rejection text
is the control flow — and naming the legal alternatives is what turns one retry into
a correct one.

Note the success reply carries the **new board state**. That saves the agent a
follow-up `get_board`: one fewer round trip, real latency and tokens.

## 5. Navigating: tools appear and disappear

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Router as Angular Router
    participant Cmp as NotesPage
    participant Lib as webmcp-angular
    participant MC as document.modelContext
    participant Agent

    User->>Router: navigate to /notes
    Router->>Cmp: create component
    Cmp->>Lib: declareWebMcpTool(add_note)
    Lib->>MC: registerTool(add_note, { signal })
    MC->>Agent: 'toolchange'
    Agent->>MC: getTools()
    MC-->>Agent: [… , add_note, list_notes]

    User->>Router: navigate to /game
    Router->>Cmp: destroy component
    Cmp->>Lib: DestroyRef fires
    Lib->>Lib: abortController.abort()
    Lib->>MC: signal aborted → tool removed
    MC->>Agent: 'toolchange'
    Agent->>MC: getTools()
    MC-->>Agent: [… ] (add_note gone)
```

There is no `unregisterTool` in the spec. **Aborting the signal *is* unregistration**
— see [chapter 2](./02-the-lifecycle.md).

Two traps on this path:

- Register through a route's `providers` array instead of the component, and the
  removal half never happens on Angular 20 or 21 — the route injector is not
  destroyed ([chapter 4](./04-scope-and-navigation.md)).
- Listen for `toolchange` on the document alone and you will never hear it on a
  polyfilled page; the polyfill dispatches only on the ModelContext
  ([chapter 6 §8](./06-what-bites-you.md)).

## 6. Cancellation, from either end

```mermaid
sequenceDiagram
    autonumber
    participant Agent
    participant MC as document.modelContext
    participant Lib as webmcp-angular wrapper
    participant Tool as your execute()

    Agent->>MC: executeTool(search, {"query":"blue shirt"})
    MC->>Lib: execute(args, { signal: agentSignal })
    Lib->>Tool: execute(args, { signal: merged })
    Tool->>Tool: fetch('/api/search', { signal })

    alt agent gives up
        Agent->>MC: abort
        MC->>Lib: agentSignal aborts
    else user navigates away
        Lib->>Lib: DestroyRef fires → abortController.abort()
    end

    Note over Lib,Tool: AbortSignal.any() means the tool<br/>sees one signal either way.
    Tool->>Tool: fetch rejects with AbortError
```

Pass `client.signal` into anything that hits the network and you get correct
cancellation from both directions for free.

## 7. Reaching an agent outside the page

Everything above assumes an agent inside the browser. WebMCP has no wire format, so
an external MCP client — Claude Desktop, Cursor — needs
[the bridge](../guide/05-inspecting-and-connecting.md#the-bridge).

```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP client
    participant Relay as extension / relay
    participant Bridge as webmcp-angular/bridge
    participant MC as document.modelContext

    Relay->>Bridge: "mcp-check-ready" (postMessage)
    Bridge-->>Relay: "mcp-server-ready"

    Client->>Relay: initialize
    Relay->>Bridge: JSON-RPC initialize
    Bridge-->>Relay: { protocolVersion, capabilities.tools.listChanged: true }

    Client->>Relay: tools/list
    Relay->>Bridge: JSON-RPC tools/list
    Bridge->>MC: getTools()
    MC-->>Bridge: [ … ]
    Bridge-->>Relay: { tools: [ … ] }

    Client->>Relay: tools/call { name, arguments }
    Relay->>Bridge: JSON-RPC tools/call
    Bridge->>MC: executeTool(tool, argsJson)
    MC-->>Bridge: result
    Bridge-->>Relay: { content: [{ type: "text", text }] }

    Note over Bridge,MC: user navigates…
    MC->>Bridge: 'toolchange'
    Bridge->>Relay: notifications/tools/list_changed
    Note over Client: refetches tools/list
```

`listChanged` is not a courtesy. Diagram 5 shows the tool list genuinely changing
under the client's feet, so one that caches without listening will call tools that no
longer exist.

## 8. Teardown

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant NG as Angular
    participant Lib as webmcp-angular
    participant MC as document.modelContext

    alt tab closed or navigated away
        User->>MC: page unloads
        Note over MC: Everything goes with the document.<br/>No cleanup to run.
    else app destroyed in place (SPA shell, tests, micro-frontend)
        NG->>Lib: root injector destroyed
        Lib->>Lib: every AbortController aborts
        Lib->>MC: all tools removed
        MC->>MC: dispatch 'toolchange'
    end
```

The second branch is the one that matters in tests and micro-frontends: destroying
the injector really does remove the tools, which is why the
[test harness](../guide/04-testing.md) can assert on it.

## 9. And on the server, nothing happens

```mermaid
sequenceDiagram
    autonumber
    participant SSR as Server render
    participant NG as Angular bootstrap
    participant Lib as webmcp-angular

    SSR->>NG: render the app
    NG->>Lib: environment initializer runs
    Lib->>Lib: typeof document === 'undefined'
    Lib-->>NG: return, silently
    Note over Lib: No warning, no throw. A ReferenceError<br/>here would take down the whole render.
```

Then the client hydrates and diagram 1 runs for real.

---

[← back to contents](./README.md)
