[← testing](./04-testing.md) · [contents](./README.md) · next: [Migrating to Angular 22 →](./06-migrating-to-angular-22.md)

# 5. Inspecting and connecting

Two optional entry points: one for seeing your tools while you build, one for letting
agents outside the page reach them.

---

## The inspector

```ts
// main.ts
import { isDevMode } from '@angular/core';

if (isDevMode()) {
  const { mountWebMcpDevtools } = await import('webmcp-angular/devtools');
  mountWebMcpDevtools();     // Ctrl/Cmd + Shift + M
}
```

A floating panel listing every tool the page currently exposes, with its schema,
arguments prefilled from that schema, a Run button, and a log of recent calls. You can
exercise a tool without an agent, an API key, or a chat window.

The tool list is live — navigate around and watch it change, which is the quickest way
to confirm your [scoping](./03-scoping-tools.md) does what you meant.

### Keep it out of your bundle

**Use a dynamic import.** That's what puts it in its own lazy chunk. Measured on a
production Angular build: ~8.6 kB raw, ~3 kB transfer, emitted to disk but **never
downloaded**, because `isDevMode()` is false and the import never runs. A *static*
import pulls the same code into `main.js` unconditionally.

If you need it gone from disk entirely, guard the call site with your own build flag
so the bundler can drop the branch.

### Placing it

It floats bottom-right by default, which is where apps tend to put chat widgets and
support bubbles. Move it, or dock it into your own layout:

```ts
mountWebMcpDevtools({ position: 'bottom-left' });

// or as a real panel in a slot you control
mountWebMcpDevtools({ position: 'inline', container: document.getElementById('slot')! });
```

`'inline'` drops the fixed positioning so the panel flows inside its container as an
ordinary block, and starts open — a docked panel collapsed to a pill would leave a
hole in your layout.

It renders in a shadow root, so your styles can't reach it and its styles can't reach
your app.

| Option | |
|---|---|
| `position` | `'bottom-right'` (default), `'bottom-left'`, `'top-right'`, `'top-left'`, `'inline'` |
| `container` | where to attach; defaults to `document.body` |
| `open` | start expanded; defaults to `true` for `'inline'`, `false` otherwise |
| `shortcut` | `false` to disable Ctrl/Cmd + Shift + M |

Returns `{ open(), close(), refresh(), destroy() }`.

---

## The bridge

WebMCP has **no wire format**. `document.modelContext` is an in-page JavaScript API
meant for the browser's own agent — so a tool your page registers is invisible to
Claude Desktop, Cursor, or anything else outside the tab.

The bridge closes that gap. It speaks MCP over JSON-RPC 2.0 in `postMessage` envelopes
compatible with `@mcp-b/transports`, answering every request by delegating to
`document.modelContext`:

```ts
import { createWebMcpBridge } from 'webmcp-angular/bridge';

const bridge = createWebMcpBridge({
  allowedOrigins: [window.location.origin],
  serverInfo: { name: 'my-app', version: '1.0.0' },
});
bridge.start();
```

A browser extension or `@mcp-b/webmcp-local-relay` can then connect and expose your
page's tools to a desktop MCP client.

**This is the one capability Angular 22 has no equivalent for**, and the reason this
package might outlive your migration.

### Security

`allowedOrigins` is **required and deliberately not defaulted**. A page that accepts
JSON-RPC from any origin lets any embedder drive its tools. `['*']` is allowed, but
you have to mean it.

The bridge also checks `event.source === window`. Those two checks are the access
control — there is nothing else.

### What it implements

`initialize` (with version negotiation), `tools/list`, `tools/call`, `ping`, and
`notifications/tools/list_changed`.

That last one isn't a courtesy: tools genuinely come and go as the user navigates, so
a client that caches the list without listening will call tools that no longer exist.

A failing tool comes back as a **successful** response with `isError: true`, not a
JSON-RPC error — MCP convention, and the same reasoning as
[chapter 2](./02-writing-tools.md): the model is meant to read the failure and adapt.
Protocol errors are reserved for protocol problems.

| Option | |
|---|---|
| `allowedOrigins` | **required** |
| `channelId` | defaults to `'mcp-default'`; must match the client's |
| `serverInfo` | `{ name, version }` reported during `initialize` |
| `onError` | protocol-level problems; defaults to a console warning |

Returns `{ start(), stop(), running }`.

---

next: [Migrating to Angular 22 →](./06-migrating-to-angular-22.md)
