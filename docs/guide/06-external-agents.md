[← the in-page agent](./05-in-page-agent.md) · [contents](./README.md) · next: [Inspecting →](./07-inspecting.md)

# 6. External agents

**The agent lives outside the page** — an extension's content script, Claude
Desktop, Cursor, any MCP client — and reaches in. It cannot see your page's
JavaScript: a content script runs in an isolated world with its own globals, and a
desktop app is not in the browser at all. What it can do is speak **MCP over
JSON-RPC**. The bridge is the adapter between that and `document.modelContext`.

This is optional, and off unless you turn it on. The [in-page agent](./05-in-page-agent.md)
never needs it.

## Who this is for

| Agent | How it reaches the page |
|---|---|
| The browser's own agent (flagged Chrome) | it owns `document.modelContext` — no bridge, nothing to do |
| Your in-page chat | calls `document.modelContext` directly — no bridge |
| An extension (the MCP-B one, or your own) | content script → `postMessage` → **the bridge** |
| Claude Desktop, Cursor, another MCP client | extension or `@mcp-b/webmcp-local-relay` → `postMessage` → **the bridge** |

## Make it opt-in

Opening the bridge lets anything that can post a message into your window — from an
allowed origin — list and call your tools. That is a decision for whoever runs the
app, so:

- **Default off.** Do not start it at bootstrap.
- **Gate it behind an explicit setting** — a user preference, a config flag, an
  environment variable, whatever "the consumer set it up" means for you.
- **Load it lazily.** `webmcp-angular/bridge` is its own entry point; a dynamic
  import keeps it in its own chunk, requested only when the switch is first turned
  on.
- **Make it stoppable.** `stop()` announces `mcp-server-stopped` and removes the
  listener, so a connected client sees the door close.

The playground does exactly this with an **External agents** checkbox in its header,
remembered in `localStorage`:

```ts
@Injectable({providedIn: 'root'})
export class ExternalAgents {
  readonly enabled = signal(readStored());        // off unless the user said otherwise
  readonly listening = signal(false);
  private bridge: WebMcpBridge | null = null;

  constructor() {
    effect(() => { writeStored(this.enabled()); void (this.enabled() ? this.start() : this.stop()); });
  }

  private async start() {
    this.bridge ??= await import('webmcp-angular/bridge').then(({createWebMcpBridge}) =>
      createWebMcpBridge({
        allowedOrigins: [window.location.origin],
        serverInfo: {name: 'my-app', version: '1.0.0'},
      }),
    );
    if (!this.enabled()) return;                    // flipped back during the import
    if (!this.bridge.running) this.bridge.start();
    this.listening.set(true);
  }

  private async stop() {
    if (this.bridge?.running) this.bridge.stop();
    this.listening.set(false);
  }
}
```

`src/app/external-agents.ts` in the playground is the full version.

## What the bridge does

It listens for `postMessage` envelopes on the page's own window — the shape
`@mcp-b/transports` defines — and answers every request by calling
`document.modelContext`:

```
  extension / relay                        bridge                        modelContext
        │ ── "mcp-check-ready" ─────────────► │
        │ ◄──────────── "mcp-server-ready" ── │
        │ ── initialize ────────────────────► │
        │ ── tools/list ────────────────────► │ ──► getTools() ──────────────► │
        │ ── tools/call {name, arguments} ──► │ ──► executeTool() ───────────► │
        │ ◄─ notifications/tools/list_changed │ ◄── 'toolchange' ─────────────│
```

The full sequence, with the extension's own steps before `mcp-check-ready`, is
[architecture chapter 8](../architecture/08-lifecycle-external-agent.md) — the whole arc, from the user installing the extension to the door closing.
How an external agent finds a page at all — it does not; the user installs the
extension — is the [discovery gap](../architecture/09-will-this-be-standardised.md#the-discovery-gap).

It works over native Chrome or the polyfill alike, because it reads whatever
`document.modelContext` is present.

## Security

`allowedOrigins` is **required and deliberately not defaulted**. A page that accepts
JSON-RPC from any origin lets any embedder drive its tools. `['*']` is allowed, but
you have to type it.

The bridge also checks `event.source === window`. Those two checks are the access
control — there is nothing else. Which is another reason to keep it opt-in.

## What it implements

`initialize` (with version negotiation), `tools/list`, `tools/call`, `ping`, and
`notifications/tools/list_changed`.

`list_changed` is not a courtesy: tools come and go as the user navigates, so a
client that caches the list without listening will call tools that no longer exist.

A failing tool comes back as a **successful** response with `isError: true`, not a
JSON-RPC error — MCP convention, and the same reasoning as
[chapter 2](./02-writing-tools.md#return-values-and-where-they-go): the model is
meant to read the failure and adapt. Protocol errors are reserved for protocol
problems.

| Option | |
|---|---|
| `allowedOrigins` | **required** |
| `channelId` | defaults to `'mcp-default'`; must match the client's |
| `serverInfo` | `{ name, version }` reported during `initialize` |
| `onError` | protocol-level problems; defaults to a console warning |

Returns `{ start(), stop(), running }`.

**Protocol version.** The bridge speaks MCP `2025-11-25`. MCP `2026-07-28` replaced
`initialize` with a stateless handshake and a mandatory `server/discover`; a client on
that revision currently gets `methodNotFound`. Tracked in
[STATUS](../STATUS.md).

---

next: [Inspecting →](./07-inspecting.md)
