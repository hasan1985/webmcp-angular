[← scope and navigation](./04-scope-and-navigation.md) · [contents](./README.md) · next: [What bites you →](./06-what-bites-you.md)

# 5. Getting tools out of the page

So far every diagram has had the agent *inside* the browser. That is what the W3C
draft is designed for. But most agents people actually use — Claude Desktop, Cursor,
a coding assistant — live outside it.

This chapter is about the gap, and the three layers that fill it.

## Who can see your tools?

```
   ┌───────────────────────────────────────────────────────────────────┐
   │  YOUR PAGE                                                        │
   │                                                                   │
   │     document.modelContext                                         │
   │            ▲              ▲                    ▲                  │
   │            │              │                    │                  │
   │            │              │                    │                  │
   │   browser's own      in-page code         the bridge              │
   │   built-in agent     (chat, devtools)     (JSON-RPC)              │
   │            │              │                    │                  │
   └────────────┼──────────────┼────────────────────┼──────────────────┘
                │              │                    │
           ✓ standard    needs executeTool     postMessage
                         (feature-detect)           │
                                                    ▼
                                         ┌────────────────────┐
                                         │  extension / relay │
                                         └─────────┬──────────┘
                                                   ▼
                                         ┌────────────────────┐
                                         │  Claude Desktop,   │
                                         │  Cursor, …         │
                                         └────────────────────┘
```

Three distinct audiences, three different requirements.

## Layer 1: the native API

Chrome 150+ behind `--enable-features=WebMCP`. Nothing to do — register tools and the
browser's agent can see them. This is the whole point of the standard, and the only
layer that will still matter in a few years.

The deprecated spelling `navigator.modelContext` was the Chrome 149 name. Resolution
order should always be:

```
   document.modelContext  →  navigator.modelContext  →  polyfill  →  nothing
```

## Layer 2: the polyfill

Native WebMCP is Chrome-only and flagged, so in practice you develop against
`@mcp-b/webmcp-polyfill`, which installs a working `document.modelContext` anywhere.
An in-page agent needs it as much as a browser agent does: Angular keeps no registry
of its own, so without an object at that address nothing registers
([chapter 2](./02-the-lifecycle.md#the-registry-is-the-browsers--even-when-the-agent-is-yours)).

It must finish **before** tools register, which rules out doing it in a provider:

```ts
// main.ts
import {installWebMcpPolyfill} from 'webmcp-angular/polyfill';

installWebMcpPolyfill()
  .then(() => bootstrapApplication(App, appConfig))
  .catch(err => console.error(err));
```

Why not a provider? `provideWebMcpTools` registers from an *environment
initializer* during bootstrap, and loading the polyfill needs an async dynamic import.
A polyfill provider would therefore resolve *after* the tools had already tried — and
silently failed — to register. An ordering trap with no error message.

Use a `.then` chain, not top-level `await`: Angular's default browserslist targets
reject it and the build fails with *"Top-level await is not available in the
configured target environment."*

The polyfill also supplies `executeTool`, in the JSON-string shape Chrome's origin
trial uses, which is what lets in-page code (a chat panel, the devtools inspector)
invoke tools today ([chapter 1](./01-what-webmcp-is.md#the-page-can-call-its-own-tools)).

## Layer 3: the bridge

Here is where your original instinct about JSON-RPC turns out to be right — just one
layer further out than the spec.

WebMCP has no wire format, so an agent outside the page cannot see
`document.modelContext` at all. The bridge speaks **MCP over JSON-RPC 2.0**, framed in
`postMessage` envelopes that `@mcp-b/transports` understands:

```ts
import {createWebMcpBridge} from 'webmcp-angular/bridge';

createWebMcpBridge({
  allowedOrigins: [window.location.origin],
  serverInfo: {name: 'my-app', version: '1.0.0'},
}).start();
```

### The envelope

```js
{
  channel: 'mcp-default',
  type: 'mcp',
  direction: 'client-to-server' | 'server-to-client',
  payload: <JSON-RPC message, or a control string>
}
```

Three control payloads sit outside JSON-RPC, for the handshake:
`'mcp-check-ready'` (client asks), `'mcp-server-ready'` and `'mcp-server-stopped'`
(server announces).

### A session

```
  client                                         bridge
    │                                              │
    │ ── "mcp-check-ready" ──────────────────────► │
    │ ◄──────────────────────── "mcp-server-ready" │
    │                                              │
    │ ── initialize ─────────────────────────────► │
    │ ◄──── {protocolVersion, capabilities, …}     │   capabilities.tools.listChanged = true
    │                                              │
    │ ── tools/list ─────────────────────────────► │──► document.modelContext.getTools()
    │ ◄──── {tools: [{name, description, …}]}      │
    │                                              │
    │ ── tools/call {name, arguments} ───────────► │──► executeTool(...)
    │ ◄──── {content: [{type: 'text', text}]}      │
    │                                              │
    │ ◄──── notifications/tools/list_changed       │   ← user navigated; list is stale
    │ ── tools/list ─────────────────────────────► │
```

That is the MCP `2025-11-25` handshake, and it is what the bridge implements
(`PROTOCOL_VERSION` in `webmcp-angular/bridge`). MCP `2026-07-28` reshaped it:
`initialize` is gone, each request carries version and capabilities in `_meta`, a
server answers `server/discover` — which also carries a server-level `instructions`
string — and a client opts into notifications with `subscriptions/listen`. A client on
the new revision that opens with `server/discover` currently gets `methodNotFound`
from the bridge; adding the new methods alongside the old ones is the open item in
[`docs/STATUS.md`](../STATUS.md).

`listChanged` is not a courtesy. Tools genuinely come and go as the user navigates
([chapter 4](./04-scope-and-navigation.md)), so a client that caches the list without
listening will act on tools that no longer exist. Under `2026-07-28` the same signal
reaches only the clients that asked for it with `subscriptions/listen`.

### Security

`allowedOrigins` is **required and deliberately not defaulted**. A page that accepts
JSON-RPC from any origin lets any embedder drive its tools. Passing `['*']` is
allowed, but you have to mean it.

The bridge also checks `event.source === window`, matching what `@mcp-b/transports`
does. Together those two checks are the access control — there is nothing else.

### One MCP convention worth copying

A tool that *fails* returns a **successful** response with `isError: true`, not a
JSON-RPC error:

```js
{content: [{type: 'text', text: 'Square 4 is already taken by X.'}], isError: true}
```

Same reasoning as [chapter 1](./01-what-webmcp-is.md): the model is meant to read the
failure and adapt. A protocol-level error is for *protocol* problems — unknown
method, malformed request, no such tool.

## Choosing a layer

| You want | Use |
|---|---|
| The browser's built-in agent to use your app | native, nothing to do |
| To develop today, in any browser | polyfill |
| An in-page chat or inspector | polyfill (for `executeTool`) |
| Claude Desktop / Cursor / an extension to reach your tools | bridge |

The layers stack — the bridge reads whatever `document.modelContext` is present,
native or polyfilled, and does not care which.

---

next: [What bites you →](./06-what-bites-you.md)
