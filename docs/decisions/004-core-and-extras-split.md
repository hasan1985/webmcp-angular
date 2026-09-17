# 004 · The core entry point is a byte-for-byte port; everything else is separate

**Status:** settled · **Date:** September 2026

## Situation

Once [001](./001-mirror-angular-not-invent.md) fixed the core, every useful thing we
wanted that Angular lacks — a polyfill installer, a strict typing helper, a test
harness, a JSON-RPC bridge, an inspector — needed a home that could not contaminate
the core surface.

## Options

| | |
|---|---|
| **Everything in one entry point**, extras exported alongside the core | one import; but a consumer's `import {x} from 'webmcp-angular'` might pull something with no Angular equivalent, and the migration schematic could not tell which imports it may rewrite |
| **Core alone in the primary entry; each extra its own secondary entry point** | the primary is exactly `@angular/core`'s surface; `webmcp-angular/bridge` etc. are visibly "not in Angular"; each compiles in its own type context and tree-shakes independently |
| Separate npm packages per extra | cleaner still; five packages to version and publish for one project |

## Decision

Six entry points: `webmcp-angular` (core, mirrors Angular), `/strict`, `/polyfill`,
`/testing`, `/bridge`, `/devtools`. Every non-core file opens with the same header:
*"No `@angular/core` equivalent"* and a sentence on what happens to it after a
migration. The schematic rewrites only the core and reports the rest for a human.

## What it cost

Secondary entry points import the core's types *by package name*, which is what a
`file:` install breaks ([011](./011-tarball-not-file-install.md)). Each entry point
also needs its own type context, so the ambient `document.modelContext` declaration
has to be brought in per entry — a type-only import that looks redundant and is not.

## Revisit when

Angular ships an equivalent of one of the extras. That entry point then gets a
migration path of its own, or is retired.
