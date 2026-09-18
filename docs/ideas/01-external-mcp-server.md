[← ideas](./README.md) · next: [Workflows →](./02-workflows.md)

# 01 · Tools from an external MCP server

## The idea

An app's operator points it at a real MCP server — a CRM, a ticketing system, an
internal API wrapped as MCP — and the agent can use that server's tools alongside the
page's own. The [in-page agent](../guide/05-in-page-agent.md) asks *"find the
customer's open tickets and add a note to the one about shipping"*, and the model
calls one remote tool and one local tool in the same turn.

## What exists today

`/bridge` is the same wire in the opposite direction: it exposes the page's tools
*out* to an MCP client ([guide chapter 6](../guide/06-external-agents.md)). Nothing
brings a server's tools *in*. The playground's chat reads exactly one registry,
`document.modelContext`, and the draft has no notion of a remote source.

## Ways to build it

```
   A · merge at the harness                    B · mirror into the registry

   MCP server ──► chat ◄── document.modelContext    MCP server ──► proxy tools ──► document.modelContext
                   │                                                                    │
                   ▼                                                              every consumer:
                 LLM                                                    chat · browser agent · extension
```

| | A · the chat holds an MCP client and merges two lists | B · the page registers one proxy tool per remote tool |
|---|---|---|
| Who sees the remote tools | your chat only | every agent — in-page, the browser's own, an extension through the bridge |
| Where routing lives | the harness decides which name goes where | nowhere: a proxy tool's `execute` forwards over HTTP, and `executeTool` does not know the difference |
| Scoping | by hand | free — register the proxies inside an injector that lives as long as the connection, or as long as a page |
| Cancellation | by hand | free — `client.signal` into `fetch` ([chapter 2 ⑤](../architecture/02-the-lifecycle.md#the-real-implementation)) |
| Chat changes | yes — a second source, merge logic, per-name dispatch | none — it just sees more tools |

## The way that fits

**B.** It keeps the single registry ([decision 023](../decisions/023-registry-at-document-modelcontext.md)),
so the remote tools are reachable on the same path as the local ones and by the same
three agents, and it keeps the chat's one rule intact — it still learns about tools
only through `getTools()`. The mechanism is the ordinary one: `declareWebMcpTool`
with an injector whose lifetime is the connection's.

Sketch of the shape, as a new entry point (`webmcp-angular/mcp-client` or similar):

```ts
// no @angular/core equivalent — a separate entry point, like /bridge
const crm = connectMcpServer({
  url: 'https://mcp.example.com/crm',
  auth: () => inject(TokenStore).bearer(),
  namespace: 'crm',                       // tools register as crm.<name>
  include: ['search_contacts', 'add_note'],   // a chosen subset, not everything
});
// registers crm.search_contacts, crm.add_note in the current injector;
// aborts them when it is destroyed; refreshes on the server's list_changed
```

Dependency-free like `/bridge`: `tools/list` and `tools/call` over HTTP are two
requests, and the envelope knowledge already exists in the bridge — this is the client
half of the same protocol.

## What it would cost

- **Names.** Remote names collide with local ones and with each other across servers;
  a collision is an unhandled rejection ([chapter 6 §2](../architecture/06-what-bites-you.md)).
  The namespace prefix is not optional.
- **Tokens.** Every mirrored description rides in every `getTools()`, on every turn.
  A server with forty tools is forty descriptions per request. Mirror a subset, or
  mirror lazily — a single `crm.list_tools` meta-tool, with the real tools registered
  on demand — which is [idea 02](./02-workflows.md) applied to discovery.
- **Consent and reach.** The page becomes a relay for a server the user configured.
  With the bridge on, an extension could reach the CRM through the page. Same rule as
  the bridge ([decision 022](../decisions/022-bridge-opt-in.md)): opt-in per server,
  operator-visible, and the tool result should say which server answered.
- **Auth.** Bearer tokens in the browser, or a backend that holds them and forwards.
  The same caveat as the API key in the chat — fine for a demo, a backend for a
  product.
- **Protocol drift.** `/bridge` already lags MCP `2026-07-28`
  ([STATUS](../STATUS.md)); a client half would have to speak whichever revision the
  server does, and `server/discover` first.
- **Two shapes of tool result.** A remote `tools/call` returns `{content, isError}`;
  the proxy's `execute` has to flatten that to text so the local convention holds
  (failures as text, [guide chapter 2](../guide/02-writing-tools.md#return-values-and-where-they-go)).

## Open questions

- Should mirrored tools carry an `annotations` hint that they leave the page, so the
  browser's own agent can treat them differently?
- Refresh policy: re-mirror on the server's `notifications/tools/list_changed`, on a
  timer, or only on reconnect?
- Does the playground grow a second toggle — **Remote servers** — beside **External
  agents**, so the demo shows both directions of the same wire?

---

next: [Workflows →](./02-workflows.md)
