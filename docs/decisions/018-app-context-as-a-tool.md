# 018 · App-wide context is an ordinary tool, not a new API

**Status:** settled · **Date:** 15 September 2026

## Situation

A model with only the tool list does not know what the app *is* — pages, which tools
come and go, shared conventions. Every `description` is per tool; MCP has a
server-level `instructions`, WebMCP has nowhere. Three additions were proposed in turn.

## Options

| Proposal | Why not |
|---|---|
| `getWelcomeMessage()` on our core | a method Angular lacks — closes the migration option ([002](./002-keep-native-migration-open.md)) |
| `notifyWebMcp()` called when an agent arrives | no "agent arrived" event exists; the page cannot know a harness is reading it ([chapter 9 · the discovery gap](../architecture/09-will-this-be-standardised.md#the-discovery-gap)) |
| `getTools()` returns the context once | `getTools()` is stateless by design; a stateful first read differs from browser and polyfill |
| **An `about_this_app` tool** whose description says "read this first" | nothing new; one line rides in every `getTools()`, the body once; reaches every consumer with no plumbing |

## Decision

A tool. The chat reads it once per session into the system prompt, again after
**New chat**. Measured: 94 characters per tool list, 989 fetched once. Documented in
architecture chapter 3.

## What it cost

A convention, not a contract: a harness that does not read it first gets the list
alone. The description is what tells the model to read it — the same mechanism every
tool relies on.

## Revisit when

The draft adds a document-level context string, or the bridge speaks `server/discover`
and its `instructions` field becomes the second home.
