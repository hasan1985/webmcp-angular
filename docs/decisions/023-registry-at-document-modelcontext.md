# 023 · The registry stays at `document.modelContext`, even for an in-page-only app

**Status:** settled · **Date:** 17 September 2026

## Situation

With the in-page agent named as the main case, the obvious question followed: if the
app calls the LLM itself and no browser agent or extension is involved, does it still
need `document.modelContext` — and so the polyfill — or could it keep its own tool
registry in Angular code?

The mechanical fact: Angular's `declareWebMcpTool` keeps no list. It writes into
`document.modelContext` and returns silently if the object is absent. Something has
to be at that address or `provideWebMcpTools` registers nothing.

## Options

| | |
|---|---|
| **A · `@mcp-b/webmcp-polyfill` provides the object** (today) | Angular's API unchanged; migration stays imports-only; browser agent and extension see the same tools; tracks the draft — every shape change in architecture chapter 6 surfaced through it. One optional, lazy-loaded peer dependency that steps aside for native |
| **B · A shim of our own at `document.modelContext`** (~60 lines) | same as A minus the dependency and the drift tracking; the polyfill's quirks (JSON-string arguments, `title: ''`, `toolchange` target) become our choices; only the chat's one adapter file would change |
| **C · An Angular `ToolRegistry` service; no `document.modelContext`** | no polyfill, typed end to end; but the core is no longer Angular's code path, the migration is no longer an import rewrite, the browser's own agent never sees the tools, and the lifetime chain, injection-context wrapper and `toolchange` equivalent are rebuilt against a private object |

## Decision

The **address** is the decision: the registry is `document.modelContext`, whoever
provides the object. That is what keeps the in-page agent, the browser's agent and the
bridge on one code path and keeps native migration free.

Who provides it stays the polyfill for now: it is optional, lazy, yields to native,
and its fidelity to the draft is how this project learned about every shape change
early. Option B is an acceptable swap for an app certain it will only ever have an
in-page agent; the moment to take it is when a polyfill change breaks the chat for a
reason that only matters to browser agents. Option C is declined.

## What it cost

One dependency and one line in `main.ts` for apps that would never use anything but
their own chat — and the polyfill's refusal to install on an insecure origin, which
such an app would not otherwise care about.

## Revisit when

The polyfill's spec-tracking costs something concrete for in-page-only apps, or a
supported browser ships native WebMCP and the question becomes moot there.
