[← what bites you](./06-what-bites-you.md) · [contents](./README.md)

# 7. The full sequence

Every exchange between your app, the browser, and an agent — from the page loading to
the tab closing.

The earlier chapters explain each mechanism in isolation. This one puts them on one
timeline, which is usually what you need when something happens in the wrong order.

**Participants**, consistent across every diagram below:

| | |
|---|---|
| **Agent** | whatever is calling your tools: the browser's own agent, an in-page chat, or an external MCP client ([diagram 2](#2-how-an-agent-discovers-the-tools)) |
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

## 2. How an agent discovers the tools

Registration (diagram 1) puts your tools on `document.modelContext`. An agent reads
them from there.

```mermaid
sequenceDiagram
    autonumber
    participant MC as document.modelContext
    participant Agent

    Note over MC: Holds the tools registered during bootstrap.

    Agent->>MC: getTools()
    MC-->>Agent: [{ name, description, inputSchema }, …]
    Note over Agent: Picks one using name + description.<br/>It cannot see your UI.
    Agent->>MC: executeTool(chosen, args)
```

Everything the agent knows about your app is the text you wrote, which is why
[descriptions matter](../guide/02-writing-tools.md#write-descriptions-for-someone-who-cant-see-your-ui).

### When the read happens

Three kinds of agent sit in that lane, and they read at different moments:

| | Where it runs | When it calls `getTools()` |
|---|---|---|
| **The browser's built-in agent** | outside the page | on its own schedule — typically when the user asks it to do something |
| **In-page code** — a chat panel, the inspector | in your page | when you call it; once per user turn is the right cadence |
| **An external MCP client** — Claude Desktop, Cursor | another process | on `tools/list` through [the bridge](#7-reaching-an-agent-outside-the-page), then again on `notifications/tools/list_changed` |

Your code is not notified when a read happens. The first thing your app observes is a
tool actually executing — diagram 3.

### An in-page chat, turn by turn

This is the case you control, so it is worth seeing in full:

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

Fetch **once per user turn**: the list is live, and the user may have navigated since
the last message and gained or lost tools (diagram 5). Fetching again between the
tool calls *within* a turn is waste — it cannot change mid-turn.

### Keeping a long-lived consumer current

A consumer that holds the list — a panel, a connected MCP client — listens for
`toolchange` and refetches:

```ts
const refresh = () => { /* getTools() again */ };

document.addEventListener('toolchange', refresh);
document.modelContext?.addEventListener?.('toolchange', refresh);   // ← both
```

Listen on both targets. The spec dispatches on the document; the polyfill dispatches
only on the ModelContext ([chapter 6 §8](./06-what-bites-you.md)).

## 3. A read-only call

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
