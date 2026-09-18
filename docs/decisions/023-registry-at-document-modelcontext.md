# 023 · The registry stays at `document.modelContext`, even for an in-page-only app

**Status:** settled · **Date:** 17 September 2026

## Situation

With the in-page agent the main case: does an app that calls the LLM itself still need
`document.modelContext` — and so the polyfill — or could it keep its own registry?
The mechanical fact: `declareWebMcpTool` keeps no list; it writes into
`document.modelContext` and returns silently if absent. Something must be at that
address or `provideWebMcpTools` registers nothing.

## Options

| | |
|---|---|
| **A · the polyfill provides the object** (today) | API unchanged; imports-only migration; browser agent and extension see the same tools; tracks the draft — every shape change in chapter 6 surfaced through it; optional, lazy, yields to native |
| **B · a ~60-line shim of our own at the address** | A minus the dependency and the drift tracking; the polyfill's quirks (JSON-string args, `title: ''`, `toolchange` target) become our choices; only the chat's adapter file changes |
| **C · an Angular `ToolRegistry` service, no `document.modelContext`** | no polyfill, typed end to end; the core is no longer Angular's path, migration no longer an import rewrite, the browser agent never sees the tools; lifetime chain, injection wrapper and `toolchange` rebuilt privately |

## Decision

The **address** is the decision: `document.modelContext`, whoever provides it — one
code path for in-page agent, browser agent and bridge, and native migration free. The
polyfill stays as provider: optional, lazy, yields to native, and its fidelity is how
shape changes were learned early. B is acceptable for an app certain to stay in-page
only, when a polyfill change breaks the chat for a browser-agent-only reason. C declined.

## What it cost

One dependency and one `main.ts` line for apps that only ever use their own chat, and
the polyfill's refusal on insecure origins.

## Revisit when

Spec-tracking costs in-page-only apps something concrete, or a supported browser ships
native WebMCP.
