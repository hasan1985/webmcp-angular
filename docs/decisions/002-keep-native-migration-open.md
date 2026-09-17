# 002 · Keep native migration an open option, not a goal

**Status:** settled · **Date:** 15 September 2026

## Situation

Early docs described the package as one that "exists to be deleted" — a stopgap
until every app is on Angular 22. Hasan corrected that: *"I am not 100% sure that we
will actually move to native Angular WebMCP after 22, I just want to keep the option
open."* Several entry points (`/bridge`, `/devtools`, `/testing`, `/polyfill`) have
no Angular equivalent and may outlive any migration.

## Options

| | |
|---|---|
| **The package is a bridge to Angular 22; plan to delete it** | clear story; but it makes staying look like failure, and it argues against investing in the non-core entry points |
| **The package is a permanent home; migration is one option among others** | honest about `/bridge` and friends; requires the core to stay swappable *forever*, not just until v22 |

## Decision

The governing constraint is a **design discipline, not a prediction**: switching to
Angular's native API must always be cheap — imports only — but whether to switch is a
call made later, on its merits. Docs say "open and easier option", never "exists to be
deleted". The [`migrate` schematic](./015-migration-schematic.md) proves the option
stays cheap; the parity gate ([010](./010-parity-gate.md)) proves it stays open.

## What it cost

Discipline without an end date. Every future change to the core has to pass "does
this widen the gap from `@angular/core`?", indefinitely.

## Revisit when

The non-core entry points are all superseded by something Angular ships. At that
point the package really would be a bridge only.
