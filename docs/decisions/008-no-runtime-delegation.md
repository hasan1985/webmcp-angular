# 008 · Drop runtime detection of Angular's implementation

**Status:** settled · **Date:** September 2026

## Situation

The plan had a `CoreDelegationGuard`: on 22+, detect `@angular/core`'s WebMCP and
delegate to it, with a dev-mode "you can migrate now" notice, to prevent double
registration during a mixed-import migration.

## Options

| | |
|---|---|
| Keep guard and notice | a second code path and failure mode; the notice fires in the unsupported-browser path too |
| **Remove; rely on the parity suite and the schematic** | our code already passes on 22 — nothing to fall back to; the schematic rewrites atomically so a mixed state never persists |

## Decision

Removed. The unsupported-browser spec asserts the library logs *nothing* — v22 returns
silently and silence is part of the contract — so any notice breaks parity; and
delegating to an identical implementation buys nothing.

## What it cost

Hand-mixed `webmcp-angular` and `@angular/core` imports for one tool name get the
duplicate-name rejection like any collision. The schematic is the supported path.

## Revisit when

Angular's implementation diverges in a way we choose not to follow; delegation on 22+
would then be the compatibility path.
