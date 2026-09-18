# 002 · Keep native migration an open option, not a goal

**Status:** settled · **Date:** 15 September 2026

## Situation

Early docs said the package "exists to be deleted" once every app is on Angular 22.
Hasan: *"I am not 100% sure that we will actually move to native Angular WebMCP after
22, I just want to keep the option open."* `/bridge`, `/devtools`, `/testing` and
`/polyfill` have no Angular equivalent and may outlive any migration.

## Options

| | |
|---|---|
| A bridge to Angular 22; plan to delete | clear story; makes staying look like failure; argues against investing in non-core entry points |
| **A permanent home; migration is one option** | honest about `/bridge` and friends; the core must stay swappable indefinitely |

## Decision

The constraint is a **design discipline, not a prediction**: switching must always be
cheap — imports only — but whether to switch is decided later, on its merits. Docs say
"open and easier option". The [`migrate` schematic](./015-migration-schematic.md) proves
it stays cheap; the parity gate ([010](./010-parity-gate.md)) proves it stays open.

## What it cost

Discipline without an end date: every core change must pass "does this widen the gap
from `@angular/core`?".

## Revisit when

Every non-core entry point is superseded by something Angular ships.
