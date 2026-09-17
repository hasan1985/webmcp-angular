[← the in-page agent](./07-lifecycle-in-page-agent.md) · [contents](./README.md) · next: [Will this be standardised? →](./09-will-this-be-standardised.md)

# 8. The full sequence: external agent

Every exchange when the agent lives **outside the page** — an extension's content
script, Claude Desktop, Cursor — and reaches your tools through the bridge. It
differs from the [in-page arc](./07-lifecycle-in-page-agent.md) in how the agent
gets to the page, how a session starts, and how the door opens and closes. From the
moment a call reaches `document.modelContext`, nothing differs, and this chapter
points at the in-page diagrams for those steps rather than repeating them.

| Lane | Is |
|---|---|
| **Operator** | whoever runs the app and decides whether outside agents may connect |
| **Client** | the MCP client: Claude Desktop, Cursor — the harness, with a model behind it |
| **Relay** | what carries JSON-RPC into the page: an extension content script, or `@mcp-b/webmcp-local-relay` |
| **Bridge** | `webmcp-angular/bridge`, listening on the page's window for `postMessage` envelopes |
| **modelContext** | `document.modelContext` — native or polyfill |

---

## 1. The page opens the door

Tools register at page load exactly as in
[in-page diagram 1](./07-lifecycle-in-page-agent.md#1-page-load-and-registration).
The bridge is a separate act, and an opt-in one:

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operator
    participant App as Your app
    participant Bridge as webmcp-angular/bridge
    participant Win as window

    Note over App: Tools registered at bootstrap — in-page diagram 1.

    Op->>App: turns on "External agents"
    App->>App: remember the choice (localStorage, config, …)
    App->>Bridge: import('webmcp-angular/bridge') — first time only
    App->>Bridge: createWebMcpBridge({ allowedOrigins, serverInfo }).start()
    Bridge->>Win: addEventListener('message')
    Bridge->>Win: postMessage "mcp-server-ready"
    Note over Bridge,Win: Heard by a relay that is already on the page.<br/>A relay that arrives later asks instead — diagram 2.
```

Off by default, loaded lazily, started only when someone asked
([guide chapter 6](../guide/06-external-agents.md#make-it-opt-in),
[decision 022](../decisions/022-bridge-opt-in.md)). Until step 4 runs, nothing outside
the page can see the tools, whatever `document.modelContext` holds.

## 2. The agent arrives and a session starts

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Client as MCP client
    participant Relay as extension content script
    participant Bridge as webmcp-angular/bridge
    participant MC as document.modelContext
    participant Model

    User->>Relay: installed the extension, once, earlier
    User->>Relay: navigates to the page — the browser injects the content script
    Note over Relay: Runs in an isolated world: same DOM, separate JS globals.<br/>It cannot read document.modelContext, so it asks over postMessage.
    Relay->>Bridge: postMessage "mcp-check-ready"
    Bridge-->>Relay: "mcp-server-ready"

    Client->>Relay: initialize
    Relay->>Bridge: JSON-RPC initialize
    Bridge-->>Relay: { protocolVersion, capabilities.tools.listChanged: true }

    Client->>Relay: tools/list
    Relay->>Bridge: JSON-RPC tools/list
    Bridge->>MC: getTools()
    MC-->>Bridge: [ get_board, make_move, … ]
    Bridge-->>Relay: { tools: [ … ] }
    Relay-->>Client: (same)
    Client->>Model: first request: system prompt + tools

    Note over Model: The first moment the model knows any tools exist.
```

Everything before step 4 is the user's doing and the browser's: the page had no way
to ask for any of it. There is no meta tag, header or manifest by which a page
announces tools; an outside agent finds them only by running code inside the page,
and the probe on step 4 is that code
([chapter 9 · the discovery gap](./09-will-this-be-standardised.md#the-discovery-gap)).

Steps 6–8 are MCP `2025-11-25`. MCP `2026-07-28` replaced `initialize` with a
stateless handshake and `server/discover`; the bridge does not answer that yet
([STATUS](../STATUS.md)).

## 3. A user asks the agent to do something

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Client as MCP client (harness)
    participant Model
    participant Relay as relay
    participant Bridge as webmcp-angular/bridge
    participant MC as document.modelContext

    User->>Client: "play X in the middle"
    Client->>Model: the request, plus the tool list from diagram 2
    Model-->>Client: call make_move({"square":4,"player":"X"})

    Client->>Relay: tools/call { name: "make_move", arguments: {…} }
    Relay->>Bridge: JSON-RPC tools/call
    Bridge->>MC: executeTool(tool, '{"square":4,"player":"X"}')
    Note over MC: From here on it is in-page diagram 3 —<br/>wrapper, injector, your service.
    MC-->>Bridge: "Played X on square 4.<br/>Board: …"
    Bridge-->>Relay: { content: [{ type: "text", text }], isError: false }
    Relay-->>Client: (same)
    Client->>Model: tool result
    Model-->>Client: "Done — X is in the centre."
    Client->>User: (same)
```

Same shape as [in-page diagram 2](./07-lifecycle-in-page-agent.md#2-a-user-asks-the-agent-to-do-something),
with two hops added between the harness and the page (steps 4–5 and 9–10). The tool
list was read once at session start, not per turn — which is why diagram 4 exists.

A rejected call comes back as a **successful** response with `isError: true` and the
tool's text in `content`, so the model reads the reason and retries — the loop in
[in-page diagram 4](./07-lifecycle-in-page-agent.md#4-a-mutating-call-that-gets-rejected-then-retried),
one envelope thicker.

## 4. Navigating: keeping the client current

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Router as Angular Router
    participant MC as document.modelContext
    participant Bridge as webmcp-angular/bridge
    participant Relay as relay
    participant Client as MCP client

    User->>Router: navigate to /notes
    Note over Router,MC: NotesPage created, add_note registered —<br/>in-page diagram 5, steps 1–4.
    MC->>Bridge: 'toolchange'
    Bridge->>Relay: notifications/tools/list_changed
    Relay->>Client: (same)
    Client->>Relay: tools/list
    Relay->>Bridge: JSON-RPC tools/list
    Bridge->>MC: getTools()
    MC-->>Bridge: [ …, add_note, list_notes ]
    Bridge-->>Client: { tools: [ … ] }

    User->>Router: navigate to /game
    Note over Router,MC: NotesPage destroyed, signal aborted, add_note removed —<br/>in-page diagram 5, steps 8–12.
    MC->>Bridge: 'toolchange'
    Bridge->>Relay: notifications/tools/list_changed
    Relay->>Client: (same)
    Note over Client: refetches — add_note gone
```

The client holds its list across turns, so it must listen. The bridge hears
`toolchange` at the ModelContext ([chapter 6 §7](./06-what-bites-you.md)) and turns
it into `list_changed`; a client that caches without listening calls tools that no
longer exist. Under MCP `2026-07-28` the notification reaches only clients that
subscribed with `subscriptions/listen`.

## 5. The door closes

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operator
    participant App as Your app
    participant Bridge as webmcp-angular/bridge
    participant Relay as relay
    participant Client as MCP client

    alt operator turns "External agents" off
        Op->>App: unticks the switch
        App->>Bridge: stop()
        Bridge->>Relay: postMessage "mcp-server-stopped"
        Bridge->>Bridge: removeEventListener('message')
        Relay->>Client: transport closed
        Note over App: Tools stay on document.modelContext —<br/>the in-page chat and the inspector still see them.
    else tab closed or navigated away
        Note over Bridge,Relay: Everything goes with the document.<br/>The content script is gone with the page.
        Relay->>Client: transport closed
    end
```

`stop()` is what makes the switch honest: a connected client is told, rather than
left posting into a window that no longer answers. Turning it back on runs diagram 1
again; a relay still on the page hears the new `mcp-server-ready`.

## Shared with the in-page arc

Inside the page, an external agent's call is indistinguishable from an in-page one.
These diagrams apply unchanged:

| In-page diagram | What it covers |
|---|---|
| [1 · Page load and registration](./07-lifecycle-in-page-agent.md#1-page-load-and-registration) | polyfill first, then bootstrap, then `registerTool` |
| [3 · Inside a tool call](./07-lifecycle-in-page-agent.md#3-inside-a-tool-call) | wrapper, `AbortSignal.any`, `runInInjectionContext`, your service |
| [4 · Rejected, then retried](./07-lifecycle-in-page-agent.md#4-a-mutating-call-that-gets-rejected-then-retried) | failure text as control flow |
| [6 · Cancellation](./07-lifecycle-in-page-agent.md#6-cancellation-from-either-end) | the caller's signal arrives through `tools/call`'s cancellation, the injector's through teardown |
| [7 · Teardown](./07-lifecycle-in-page-agent.md#7-teardown) | injector destroyed → every tool removed |
| [8 · The server](./07-lifecycle-in-page-agent.md#8-and-on-the-server-nothing-happens) | nothing registers, nothing bridges |

---

next: [Will this be standardised? →](./09-will-this-be-standardised.md)

[← back to contents](./README.md)
