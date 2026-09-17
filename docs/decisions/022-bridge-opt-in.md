# 022 · The bridge is opt-in, off by default

**Status:** settled · **Date:** 16 September 2026

## Situation

The playground started the JSON-RPC bridge unconditionally in `main.ts`. Hasan's
main use case is an **in-page agent** — the app calls the LLM's API itself and hands
it the page's tools — which never needs the bridge. Opening it exposes the page's
tools to anything that can post a message into the window from an allowed origin.
That is a decision for whoever runs the app, and the default was making it for
them.

## Options

| | |
|---|---|
| Start the bridge at bootstrap, as before | one less thing to explain; but every deployment is listening whether or not anyone intended it, and the bridge chunk is downloaded by everyone |
| Start it only in dev mode | wrong axis — an external agent is a production feature for the people who want it |
| **Start it only behind an explicit setting; default off; load it lazily; make it stoppable** | the person setting up the app chooses; the chunk is fetched on first enable; `stop()` tells a connected client the door closed |

## Decision

The library already made the bridge a separate entry point with an explicit
`start()`. The playground now models the recommended pattern: an `ExternalAgents`
service with an `enabled` signal, remembered in `localStorage`, driving a dynamic
import of `webmcp-angular/bridge` and `start()` / `stop()`; a checkbox in the header
bound to it. Guide chapter 6 states the rule for consumers: default off, gate behind
a setting, load lazily, make stoppable.

This is also where the two use cases got their names — **in-page agent** (guide
chapter 5) and **external agent** (chapter 6) — because the distinction is what
decides whether the bridge is needed at all.

## What it cost

One more switch in the playground UI, and a demo step: to show the bridge, tick
**External agents** first.

## Revisit when

A hosting model appears where the operator, not the page, decides exposure — then
the setting moves out of the page.
