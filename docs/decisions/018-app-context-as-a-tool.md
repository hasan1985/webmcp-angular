# 018 · App-wide context is an ordinary tool, not a new API

**Status:** settled · **Date:** 15 September 2026

## Situation

A model that gets only the tool list does not know what the app *is*: which pages
exist, which tools come and go with them, the conventions every tool shares. Every
`description` is per tool. MCP has a server-level `instructions` string; WebMCP has
nowhere to put one. Three additions were proposed in turn.

## Options

| Proposal | Why not |
|---|---|
| `getWelcomeMessage()` on our core | a method Angular's API does not have — closes the migration option ([002](./002-keep-native-migration-open.md)) |
| A built-in `notifyWebMcp()` the page calls when an agent arrives | there is no "agent arrived" event to hook; the page cannot know a harness is reading it (architecture [chapter 9 · the discovery gap](../architecture/09-will-this-be-standardised.md#the-discovery-gap)) |
| Have `getTools()` return the context once, then not again | `getTools()` is stateless by design; a stateful first read would differ from the browser's and the polyfill's |
| **An `about_this_app` tool** whose description says "read this first" | needs nothing new; only its one-line description rides in every `getTools()`; the body travels once, when a harness reads it; reaches every consumer — browser agent, in-page chat, MCP client through the bridge — with no plumbing |

## Decision

A tool. The playground chat reads it once per session into the system prompt, and
re-reads after **New chat**. Measured cost: 94 characters in every tool list, 989
fetched once. Documented as a pattern in architecture chapter 3.

## What it cost

It is a convention, not a contract. A harness that does not know to read it first
gets the list without the context. The model is told to read it by the description,
which is the same mechanism every other tool relies on.

## Revisit when

The draft adds a document-level context string, or the bridge speaks
`server/discover` and its `instructions` field becomes the natural second home.
