# 017 · The playground chat may only reach the app through `document.modelContext`

**Status:** settled · **Date:** September 2026

## Situation

The chat needs to know which tools exist and run them. `GameStore` and `NotesStore` are
one import away and calling them directly would be simpler to debug.

## Options

| | |
|---|---|
| Import the stores; wrap them for the model | works identically with WebMCP deleted — proves nothing |
| **`getTools()` and `executeTool()`, nothing else** | the chat is a faithful stand-in for a real harness, which *is* the WebMCP consumer; broken registration shows in the chat |

## Decision

A one-rule file, `chat/webmcp-bridge.ts`, stated at its top so nobody "just imports the
store" while debugging. The same rule made the loop **manual** rather than the SDK's
tool runner: the runner wants local `run` functions declared up front; these are
discovered at runtime.

## What it cost

Every page-to-agent feature must be a tool or text. That produced
[018](./018-app-context-as-a-tool.md) and the `AgentTurn` service — a one-way channel
carrying a plain string, so the game hands the agent a turn without either side
importing the other.

## Revisit when

Never. This is what the playground exists to demonstrate.
