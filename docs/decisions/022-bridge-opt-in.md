# 022 · The bridge is opt-in, off by default

**Status:** settled · **Date:** 16 September 2026

## Situation

The playground started the bridge unconditionally. Hasan's main case is an **in-page
agent**, which never needs it, and an open bridge exposes the tools to anything posting
into the window from an allowed origin — the operator's decision, being made for them.

## Options

| | |
|---|---|
| Start at bootstrap | every deployment listens whether intended or not; everyone downloads the chunk |
| Start in dev mode only | wrong axis — an external agent is a production feature for those who want it |
| **Behind an explicit setting; default off; lazy; stoppable** | the operator chooses; the chunk loads on first enable; `stop()` tells a connected client |

## Decision

The library already had a separate entry point with explicit `start()`. The playground
models the pattern: an `ExternalAgents` service with an `enabled` signal in
`localStorage`, driving a dynamic import and `start()`/`stop()`, bound to a header
checkbox. Guide chapter 6 states the rule for consumers. This is also where the two
cases got their names — **in-page agent** (guide 5), **external agent** (guide 6) —
since the distinction decides whether the bridge is needed.

## What it cost

One more switch, and a demo step: tick **External agents** first.

## Revisit when

A hosting model where the operator, not the page, decides exposure.
