# 020 · Follow the draft although WebKit opposes it

**Status:** settled · **Date:** 16 September 2026 (positions verified via GitHub API)

## Situation

WebMCP is a W3C Community Group draft, which cannot become a Recommendation on its
own. Chromium is implementing (origin trial from Chrome 149, ship targeted ~157).
Mozilla recorded `position: neutral` (closed 2026-08-05). WebKit recorded
`position: oppose` (closed 2026-06-11) with eight concerns, two of which — venue, and
meaningful user consent — are about the premise rather than the details.

## Options

| | |
|---|---|
| Wait for multi-engine agreement before building | may never come; Angular has already shipped |
| Build our own agent-facing API that does not depend on the draft | strands every app when a standard does land; violates [001](./001-mirror-angular-not-invent.md) |
| **Follow the draft through Angular's API, and bound the cost of every outcome** | if adopted, the code already has the right shape; if Chromium-only, the polyfill stays permanently and nothing changes; if redesigned, Angular follows and we follow Angular, and the thin-tool boundary is where the change stops |

## Decision

Follow the draft. The design already makes each outcome cheap: the polyfill is the
floor, `/bridge` speaks to agents that exist regardless, the core mirrors Angular
which mirrors the draft, and tools are thin wrappers over services that know nothing
about WebMCP. Architecture chapter 9 lays out the evidence and the re-check commands.

## What it cost

Building on something that may stay Chromium-only forever. The `0.x` version and the
weekly parity cron are the honest acknowledgement.

## Revisit when

A second engine starts an implementation (the strongest signal), WebKit moves off
`oppose`, the work moves to a chartered Working Group, or Chrome 157 slips.
