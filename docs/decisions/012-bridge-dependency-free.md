# 012 · `/bridge` implements the MCP-B envelope itself

**Status:** settled · **Date:** September 2026

## Situation

WebMCP has no wire format; agents outside the page cannot see `document.modelContext`.
MCP-B bridges that with MCP-over-JSON-RPC in `postMessage` envelopes
(`@mcp-b/transports`), which their extension speaks. We wanted our tools reachable so.

## Options

| | |
|---|---|
| Depend on `@mcp-b/global` | installs polyfill + MCP server + transport; *replaces* `document.modelContext` with its wrapper; MCP SDK in the bundle |
| `@mcp-b/transports` + `@modelcontextprotocol/server` | the "right" way; two runtime deps for four methods |
| **Implement envelope and methods ourselves**, type-only dep on `@mcp-b/webmcp-types` | ~250 lines; `@mcp-b/*` stays optional; reads `document.modelContext` directly so native or polyfill both work |

## Decision

Dependency-free. `createWebMcpBridge({allowedOrigins, channelId, serverInfo})` answers
`initialize`, `tools/list`, `tools/call`, `ping`, pushes `notifications/tools/list_changed`.
`allowedOrigins` is **required, not defaulted** — `['*']` allowed but must be typed —
and `event.source === window` is checked, as `@mcp-b/transports` does.

## What it cost

We track MCP by hand. `2026-07-28` replaced `initialize` with `server/discover` and
made notifications opt-in; the bridge speaks `2025-11-25`, so a current client gets
`methodNotFound` — STATUS thread 3.

## Revisit when

The bridge needs resources, prompts or sampling; the SDK is then cheaper.
