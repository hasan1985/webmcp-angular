# 001 · Mirror Angular 22's API instead of designing our own

**Status:** settled · **Date:** September 2026

## Situation

The project started as "a standalone npm package bringing WebMCP to Angular". The
first design sketch was our own: a JSON-RPC layer to native browser function calls,
plus a registry of resources and tasks. Then we read Angular 22's shipped
implementation and found it was 25 lines: `DestroyRef → AbortController →
registerTool({signal})`, run inside the injection context. Angular 20 and 21 have
nothing, and the team marks the API `@experimental`.

## Options

| | Pros | Cons |
|---|---|---|
| **Own API** — decorators, a registry, resources and prompts | freedom to design; could be "better" | every app written against it is stranded when Angular's lands; `NicoAvanzDev/ng-webmcp` already occupies this space |
| **Port Angular 22's API to 20/21, line for line** | apps written today are already in Angular's shape; the migration is an import rewrite | inherits Angular's defects (see [009](./009-one-provider-call-per-tool.md)); no room for "improvements" in the core |
| Wrapper over `@mcp-b/global` | least code | its API is MCP-shaped, not Angular-shaped; drags in an MCP server and transports |

## Decision

Port Angular 22's public surface and semantics exactly — `declareWebMcpTool`,
`provideWebMcpTools`, `WebMcpToolDescriptor`, `WebMcpToolExecute`, `WebMcpClient`,
`JsonSchemaForInference` from the same `@mcp-b/webmcp-types` Angular vendors. No
inventions in the core entry point. Anything we want that Angular lacks goes into a
separate entry point ([004](./004-core-and-extras-split.md)) or upstream as an Angular
issue.

## What it cost

The JSON-RPC idea was not wrong — it is exactly what `/bridge` became — but it moved
from the centre of the design to an optional edge. And the core cannot fix things
we know are wrong upstream: the un-awaited provider loop, the single type parameter.
We replicate those and document them.

## Revisit when

Angular removes or redesigns its WebMCP API. Then "mirror Angular" has no target, and
the core either follows the new shape or freezes at v22's.
