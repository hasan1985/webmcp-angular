# 015 · Ship a `migrate` schematic, not `ng add`

**Status:** settled · **Date:** September 2026

## Situation

[002](./002-keep-native-migration-open.md) promises "imports only". That needs a
mechanism that proves it, and the mixed-import window of a hand migration is where
duplicate registrations happen ([008](./008-no-runtime-delegation.md)).

## Options

| | |
|---|---|
| `ng add webmcp-angular` | conventional; but install is `npm i` plus one `main.ts` line — little to do |
| Documented find-and-replace | works; leaves the mixed-import window open as long as the human takes |
| **`ng generate webmcp-angular:migrate`** | rewrites every core import to `@angular/core`, aliases the two renamed functions, reports non-core imports for a human, removes the dependency only when nothing else imports it |

## Decision

The schematic, with its header rule: *if it must change anything other than an import
path, the backport was not compatible and the parity suite missed something.*
Negative-tested: a project also importing `/bridge` is reported, not rewritten, and
keeps the dependency.

## What it cost

Its own tsconfig and build step (`scripts/build-schematics.mjs`); the packaging check
asserts it is in the tarball. `ng add` remains on the not-done list for discoverability.

## Revisit when

Angular renames the core symbols or drops `Experimental` ([003](./003-naming.md)) —
`CORE_SYMBOLS` is the one place to change.
