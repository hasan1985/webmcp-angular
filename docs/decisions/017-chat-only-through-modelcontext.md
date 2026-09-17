# 017 · The playground chat may only reach the app through `document.modelContext`

**Status:** settled · **Date:** September 2026

## Situation

The chat panel needs to know which tools exist and run them. `GameStore` and
`NotesStore` are right there, one import away, and calling them directly would be
simpler and faster to debug.

## Options

| | |
|---|---|
| Import the stores; wrap them as tools for the model | works identically with WebMCP deleted — and therefore proves nothing about WebMCP |
| **Discover via `getTools()`, invoke via `executeTool()`, and nothing else** | the chat is a faithful stand-in for a real agent harness, which *is* the WebMCP consumer; if something is broken in registration, the chat shows it |

## Decision

A one-rule file, `chat/webmcp-bridge.ts`: the chat may only learn about tools
through `getTools()` and run them through `executeTool()`, and must never import a
feature service. The rule is stated at the top of the file so nobody "just imports the
store" while debugging. The same rule shaped the chat's loop: a **manual** tool loop
rather than the SDK's tool runner, because the runner wants tools with local `run`
functions declared up front and these are discovered at runtime from the page.

## What it cost

Every page-to-agent feature has to be expressed as a tool or as text. That is what
produced [018](./018-app-context-as-a-tool.md) and the `AgentTurn` service — a one-way
channel carrying a plain string, so the game can hand the agent a turn without either
side importing the other.

## Revisit when

Never. This is the thing the playground exists to demonstrate.
