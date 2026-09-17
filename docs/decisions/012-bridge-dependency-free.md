# 012 · `/bridge` implements the MCP-B envelope itself

**Status:** settled · **Date:** September 2026

## Situation

WebMCP has no wire format; an agent outside the page — Claude Desktop, Cursor, an
extension — cannot see `document.modelContext`. The MCP-B ecosystem bridges that with
MCP-over-JSON-RPC in `postMessage` envelopes (`@mcp-b/transports`), and their
extension's content script speaks that envelope. We wanted our tools reachable that
way.

## Options

| | |
|---|---|
| Depend on `@mcp-b/global` | one import installs the polyfill, an MCP server and a transport; also *replaces* `document.modelContext` with its wrapper, and pulls the MCP SDK into the bundle |
| Depend on `@mcp-b/transports` + `@modelcontextprotocol/server` | the "right" MCP way; two runtime dependencies for four JSON-RPC methods |
| **Implement the envelope and the four methods ourselves**, type-only dependency on `@mcp-b/webmcp-types` | ~250 lines; `@mcp-b/*` stays optional; works over native Chrome or the polyfill alike because it reads `document.modelContext` directly |

## Decision

Dependency-free. `createWebMcpBridge({allowedOrigins, channelId, serverInfo})`
answers `initialize`, `tools/list`, `tools/call`, `ping`, and pushes
`notifications/tools/list_changed`. `allowedOrigins` is **required and not
defaulted** — a page accepting JSON-RPC from any origin lets any embedder drive its
tools; `['*']` is allowed but must be typed. Message handling also checks
`event.source === window`, as `@mcp-b/transports` does.

## What it cost

We track the MCP protocol by hand. MCP `2026-07-28` replaced `initialize` with
`server/discover` and made notifications opt-in; the bridge still speaks
`2025-11-25`, and a current client gets `methodNotFound` — STATUS.md thread 3.

## Revisit when

The bridge needs more than tools (resources, prompts, sampling). At that point the
SDK is the cheaper path and the dependency is worth taking.
