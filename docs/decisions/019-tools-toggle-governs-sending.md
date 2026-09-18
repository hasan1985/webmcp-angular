# 019 · The WebMCP toggle governs what the chat sends, not what the page registers

**Status:** settled · **Date:** 16 September 2026

## Situation

Hasan wanted an **Enable WebMCP** button — without it, no tool call — "to test what
happens when we enable WebMCP". The question was what "off" means.

## Options

| Off means… | |
|---|---|
| destroy the injectors so `getTools()` is empty | the inspector, browser agent and any MCP client lose the tools too — a different act |
| send `tools: []` | the model is told there are tools and there are none; some APIs reject it |
| **omit the `tools` key, swap to a plain system prompt, skip `getTools()` and the context read** | registration untouched; the request is what a chat with no WebMCP would send |

| Switching mid-conversation | |
|---|---|
| keep the history | `tool_use` / `tool_result` blocks replayed with no `tools` key leave the model reading blocks it has no schema for |
| keep it, send `tools` + `tool_choice: {type: 'none'}` | works; more state |
| **start a new session** | simplest; matches how people think of a mode switch |

## Decision

Two things move — the `tools` key and the system prompt — registration does not. The
switch starts a new chat; "Agent plays back" is disabled while off; state lives in
`AgentTurn.webMcpEnabled` so the game page can grey its checkbox. Verified from request
bodies: off → no `tools`, model says it cannot see the page; on → four tools,
`get_board` runs.

## What it cost

A tool-aware prompt with tools off makes the model narrate calls it never made, so the
prompt swaps too — two prompts to keep in step.

## Revisit when

A use case needs mid-conversation switching; the `tool_choice: none` variant is
documented for it.
