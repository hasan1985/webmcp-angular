# 006 · The polyfill is installed in `main.ts`, before bootstrap, not by a provider

**Status:** settled · **Date:** September 2026

## Situation

`provideWebMcpTools` registers from an environment initializer *during* bootstrap.
Loading `@mcp-b/webmcp-polyfill` (an optional peer) needs an async dynamic import. Order
matters: no `document.modelContext` at registration time means silent no-ops.

## Options

| | |
|---|---|
| `providePolyfill()` provider | idiomatic; an async provider resolves after the initializers have run — tools silently fail. An ordering trap with no error |
| Static import at the top of `main.ts` | works; hard dependency, in every bundle, native browsers included |
| **`installWebMcpPolyfill().then(() => bootstrapApplication(...))`** | awaited *before* bootstrap; dynamic import keeps it optional; returns `'native' \| 'polyfill' \| 'server' \| 'unavailable'` |
| Top-level `await` | cleaner; Angular's default browserslist rejects it and the build fails |

## Decision

A function, awaited via `.then` in `main.ts`. Never replaces native, no-ops on the
server, resolves `'unavailable'` rather than throwing when the peer is absent.

## What it cost

One line of ceremony per consumer and a rule to teach: polyfill first, then bootstrap,
or a working app with no tools and no error.

## Revisit when

Angular ships an async bootstrap hook that runs before environment initializers, or
every supported browser has native WebMCP.
