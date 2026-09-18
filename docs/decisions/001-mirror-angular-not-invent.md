# 001 · Mirror Angular 22's API instead of designing our own

**Status:** settled · **Date:** September 2026

## Situation

The first sketch was our own design: a JSON-RPC layer over browser function calls plus
a registry of resources and tasks. Then we read Angular 22's shipped implementation:
25 lines, `DestroyRef → AbortController → registerTool({signal})` inside the injection
context, marked `@experimental`. Angular 20 and 21 have nothing.

## Options

| | |
|---|---|
| Own API — decorators, registry, resources, prompts | free to design; strands every app when Angular's lands; `NicoAvanzDev/ng-webmcp` already occupies this space |
| **Port Angular 22's API to 20/21, line for line** | apps are already in Angular's shape; migration is an import rewrite; inherits Angular's defects ([009](./009-one-provider-call-per-tool.md)); no "improvements" in the core |
| Wrapper over `@mcp-b/global` | least code; MCP-shaped not Angular-shaped; drags in an MCP server and transports |

## Decision

Port Angular 22's surface and semantics exactly — `declareWebMcpTool`,
`provideWebMcpTools`, `WebMcpToolDescriptor`, `WebMcpToolExecute`, `WebMcpClient`,
`JsonSchemaForInference` from the same `@mcp-b/webmcp-types` Angular vendors. No
inventions in the core; extras go to separate entry points ([004](./004-core-and-extras-split.md))
or upstream as Angular issues.

## What it cost

The JSON-RPC idea moved from the centre to an optional edge (`/bridge`). The core
replicates known upstream defects — the un-awaited provider loop, the single type
parameter — and documents them instead of fixing them.

## Revisit when

Angular removes or redesigns its WebMCP API; then the core follows the new shape or
freezes at v22's.
