# 015 · Ship a `migrate` schematic, not `ng add`

**Status:** settled · **Date:** September 2026

## Situation

[002](./002-keep-native-migration-open.md) says migration must cost "imports only".
A promise like that needs a mechanism that proves it, and the mixed-import window
during a hand migration is where duplicate registrations would occur
([008](./008-no-runtime-delegation.md)).

## Options

| | |
|---|---|
| `ng add webmcp-angular` | the conventional entry point; but adding the package is `npm i` plus one line in `main.ts` — there is little for `ng add` to do |
| Document the migration as a find-and-replace | works; leaves the mixed-import window open for as long as the human takes |
| **`ng generate webmcp-angular:migrate`** | one command rewrites every core import to `@angular/core`, aliases the two renamed functions so call sites are untouched, reports imports from non-core entry points for a human to decide, and removes the dependency only when nothing else imports it |

## Decision

The schematic, with a rule stated in its header: *if it has to change anything other
than an import path, the backport was not actually compatible and the parity suite
missed something.* It is negative-tested — a project that also imports `/bridge` is
reported, not rewritten, and keeps the dependency.

## What it cost

Schematics need their own tsconfig and a build step (`scripts/build-schematics.mjs`),
and the packaging check asserts they are present in the tarball. `ng add` may still
be worth doing for discoverability; it is on the not-done list.

## Revisit when

Angular renames the core symbols again, or drops `Experimental`
([003](./003-naming.md)) — the `CORE_SYMBOLS` map is the one place to change.
