# 006 · The polyfill is installed in `main.ts`, before bootstrap, not by a provider

**Status:** settled · **Date:** September 2026

## Situation

Without native WebMCP, `document.modelContext` has to be installed by
`@mcp-b/webmcp-polyfill` before any tool registers. `provideWebMcpTools` registers
its tools from an environment initializer *during* bootstrap. Loading the polyfill
needs an async dynamic import (it is an optional peer dependency).

## Options

| | |
|---|---|
| `providePolyfill()` provider | idiomatic Angular; but an async provider resolves after the environment initializers have already run — the tools would have tried to register, found nothing, and returned silently. An ordering trap with no error. |
| Import the polyfill statically at the top of `main.ts` | works; makes the polyfill a hard dependency and puts it in every bundle, native browsers included |
| **`installWebMcpPolyfill().then(() => bootstrapApplication(...))`** | the await is *before* bootstrap so the order cannot be wrong; dynamic import keeps the dependency optional; returns `'native' \| 'polyfill' \| 'server' \| 'unavailable'` so the app can tell what it got |
| Top-level `await` in `main.ts` | cleaner; Angular's default browserslist rejects it and the build fails |

## Decision

A function, not a provider, awaited via a `.then` chain in `main.ts`. It never
replaces a native implementation, no-ops on the server, and resolves `'unavailable'`
rather than throwing when the peer dependency is absent.

## What it cost

One line of ceremony in every consumer's `main.ts`, and a rule to teach: polyfill
first, then bootstrap, or you get a working app with no tools and no error.

## Revisit when

Angular ships an async-capable bootstrap hook that runs before environment
initializers, or every supported browser has native WebMCP.
