# 020 · Follow the draft although WebKit opposes it

**Status:** settled · **Date:** 16 September 2026 (positions verified via GitHub API)

## Situation

WebMCP is a W3C Community Group draft; it cannot become a Recommendation alone.
Chromium implements (origin trial from Chrome 149, ship ~157). Mozilla: `position:
neutral` (closed 2026-08-05). WebKit: `position: oppose` (closed 2026-06-11), eight
concerns, two — venue and meaningful user consent — about the premise.

## Options

| | |
|---|---|
| Wait for multi-engine agreement | may never come; Angular has shipped |
| Our own agent-facing API, draft-independent | strands every app when a standard lands; violates [001](./001-mirror-angular-not-invent.md) |
| **Follow the draft through Angular's API; bound every outcome's cost** | adopted → code already right; Chromium-only → polyfill stays, nothing changes; redesigned → Angular follows, we follow Angular, the thin-tool boundary stops the change |

## Decision

Follow the draft. The design makes each outcome cheap: polyfill as floor, `/bridge` to
agents that exist regardless, core mirrors Angular which mirrors the draft, tools as
thin wrappers. Architecture chapter 9 has the evidence and re-check commands.

## What it cost

Building on something that may stay Chromium-only. `0.x` and the weekly parity cron are
the acknowledgement.

## Revisit when

A second engine starts implementing (the strongest signal), WebKit moves off `oppose`,
the work moves to a Working Group, or Chrome 157 slips.
