# 019 · The WebMCP toggle governs what the chat sends, not what the page registers

**Status:** settled · **Date:** 16 September 2026

## Situation

Hasan wanted an **Enable WebMCP** button: without it, no tool call — "just to test
what happens when we enable WebMCP". The question was what "off" means.

## Options

| | |
|---|---|
| Off = destroy the injectors that own the tools, so `getTools()` is empty | the inspector, the browser's agent and any connected MCP client lose the tools too; that is a different act |
| Off = send an empty `tools: []` | the model is told there are tools and there are none; some APIs reject it |
| **Off = omit the `tools` key entirely, swap to a plain system prompt, skip `getTools()`, skip the context read** | registration untouched; the request is exactly what a chat with no WebMCP would send |

And on switching mid-conversation:

| | |
|---|---|
| Keep the history | a transcript holding `tool_use` / `tool_result` blocks replayed with no `tools` key leaves the model reading blocks it has no schema for |
| Keep it, but send `tools` + `tool_choice: {type: 'none'}` when history holds tool blocks | works; more state to track |
| **The toggle starts a new session** | simplest; matches how people think about a mode switch |

## Decision

Two things move with the toggle — the `tools` key and the system prompt — and
registration is not one of them. The switch starts a new chat. "Agent plays back" is
disabled while off. State lives in `AgentTurn.webMcpEnabled` so the game page can
grey out its checkbox. Verified by capturing the request bodies: off → no `tools`
key, model says it cannot see the page; on → four tools, `get_board` runs.

## What it cost

A tool-aware prompt left in place with tools off makes the model narrate calls it
never made — so the prompt has to be swapped, not just the key. Two prompts to keep
in step.

## Revisit when

A use case needs the mode to change mid-conversation. The `tool_choice: none` variant
is documented for that.
