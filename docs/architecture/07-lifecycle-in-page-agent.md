[← what bites you](./06-what-bites-you.md) · [contents](./README.md) · next: [The full sequence: external agent →](./08-lifecycle-external-agent.md)

# 7. The full sequence: in-page agent

Every exchange between your app, the browser, and an agent **you wrote into the
page** — a chat panel that calls the LLM itself — from page load to tab close. Each
diagram gets a few lines and a link to the chapter that explains it.

An agent that reaches in from *outside* the page — an extension, Claude Desktop — is
[chapter 8](./08-lifecycle-external-agent.md). Diagrams 3–8 here are shared: once a
call is inside the page, nothing differs.

| Lane | Is |
|---|---|
| **Agent** | your chat: a *harness* (code) plus a *model* (the LLM); diagram 2 splits them |
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

Polyfill first, then bootstrap. Flip the order and step 12 never happens: the adapter
finds no `document.modelContext`, returns silently, and you get a working app with no
tools ([chapter 5](./05-transports.md#layer-2-the-polyfill)).

## 2. A user asks the agent to do something

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

Only the harness touches the page (steps 2 and 6). The model is handed the list (4)
and answers with a name and arguments (5), chosen from `name` and `description` alone
([chapter 1](./01-what-webmcp-is.md#who-calls-which)). Step 2 happens because of
step 1. Steps 6–9 are diagram 3.

### How each agent reached the page

| Agent | Got to the page by | Calls `getTools()` because |
|---|---|---|
| **Browser's own** | the user opened the page; the browser takes an *observation* of the tab | it owns the registry |
| **In-page chat** | you wrote it into the page | you wrote that line |
| **Extension / MCP client** | the user installed it once; the browser injects its script; it probes over `postMessage` | its author wrote the probe — [chapter 8](./08-lifecycle-external-agent.md) is that arc |

### Session start

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Chat as In-page chat (harness)
    participant Page as Page · document.modelContext
    participant Model

    Note over Page: Tools already registered — diagram 1.

    User->>Chat: starts a new chat session
    Chat->>Page: is document.modelContext defined?
    Page-->>Chat: yes
    Note over Chat: Calls getTools() because its author<br/>wrote it to. This is code, not a discovery.
    Chat->>Page: getTools()
    Page-->>Chat: [ get_board, make_move, … ]
    Chat->>Model: first request: system prompt + tools

    Note over Model: The first moment the model knows any tools exist.
```

A new session is an empty history, so this runs from the top each time. What the app
is *as a whole* rides as a tool of its own (`about_this_app`), read once per session
into the system prompt ([chapter 3](./03-anatomy-of-a-call.md#writing-a-good-tool)).

### Cadence, when you control the agent

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Chat as In-page chat
    participant MC as document.modelContext
    participant LLM as Messages API

    User->>Chat: "add two blue shirts"

    alt tool mode ON
        Chat->>MC: getTools()
        MC-->>Chat: the list, as it is right now
        Chat->>LLM: messages + tools + tool-aware system prompt
        Note over Chat,LLM: The Messages API is stateless,<br/>so tools travel on every request.
        LLM-->>Chat: tool_use
        Chat->>MC: executeTool(…)
        MC-->>Chat: result
        Chat->>LLM: messages + tool_result + tools
        LLM-->>Chat: final answer
    else tool mode OFF
        Note over Chat,MC: No read at all — the list is not needed.
        Chat->>LLM: messages + plain system prompt
        Note over Chat,LLM: No `tools` key. Omit it rather than<br/>sending an empty array.
        LLM-->>Chat: answer
    end
```

Once per user turn — the list is live (diagram 5) — and not again between the calls
within a turn. In the playground the read is wrapped as `discoverTools()`.

| The toggle moves | The toggle leaves alone |
|---|---|
| the `tools` key **and** the system prompt — swap both, or the model narrates calls it never made | registration: tools stay on `document.modelContext` for the inspector, the browser's agent, and any MCP client |
| mid-conversation: start a new session, or keep sending `tools` with `tool_choice: {type: 'none'}` once the history holds tool blocks | |

## 3. Inside a tool call

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

Step 3 merges the two cancellations into one signal; step 4 is why `inject()` works
inside `execute` ([chapter 2](./02-the-lifecycle.md#the-real-implementation)).

## 4. A mutating call that gets rejected, then retried

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

The rejection text is the control flow: step 5 names the legal alternatives, so step 7
is right first time. Step 11 returns the new state and saves a `get_board` round trip
([chapter 3](./03-anatomy-of-a-call.md#writing-a-good-tool)).

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

Aborting the signal *is* unregistration ([chapter 2](./02-the-lifecycle.md)). A
long-lived consumer refetches on `toolchange`, which fires at the ModelContext
([chapter 6 §7](./06-what-bites-you.md)). Route-level `providers` skip steps 9–12 on
Angular 20/21 ([chapter 4](./04-scope-and-navigation.md#the-trap-route-level-providers)).

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

Pass `client.signal` into anything that hits the network and both directions cancel
correctly for free.

## 7. Teardown

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

The second branch is what the [test harness](../guide/04-testing.md) asserts on.

## 8. And on the server, nothing happens

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

next: [The full sequence: external agent →](./08-lifecycle-external-agent.md)

[← back to contents](./README.md)
