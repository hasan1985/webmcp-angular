# 004 · The core entry point is a byte-for-byte port; everything else is separate

**Status:** settled · **Date:** September 2026

## Situation

With the core fixed by [001](./001-mirror-angular-not-invent.md), the polyfill
installer, strict typing helper, test harness, bridge and inspector needed a home that
could not contaminate the core surface.

## Options

| | |
|---|---|
| One entry point, extras beside the core | one import; `import {x} from 'webmcp-angular'` might pull something with no Angular equivalent; the schematic could not tell which imports to rewrite |
| **Core alone in the primary; each extra a secondary entry point** | the primary is exactly `@angular/core`'s surface; `/bridge` etc. are visibly "not in Angular"; each compiles and tree-shakes on its own |
| A package per extra | cleaner; five packages to version for one project |

## Decision

Six entry points: `webmcp-angular` (core), `/strict`, `/polyfill`, `/testing`,
`/bridge`, `/devtools`. Every non-core file opens *"No `@angular/core` equivalent"*
plus what happens to it after a migration. The schematic rewrites the core and reports
the rest.

## What it cost

Secondary entry points import the core's types by package name — what a `file:`
install breaks ([011](./011-tarball-not-file-install.md)). Each needs its own type
context, so the ambient `document.modelContext` declaration is imported per entry —
type-only, looks redundant, is not.

## Revisit when

Angular ships an equivalent of an extra; that entry point gets its own migration path
or is retired.
