# 003 · `webmcp-angular`; no `ng-` prefix; no `Experimental` in our names

**Status:** settled · **Date:** 15 September 2026

## Situation

The workspace was created as `ng-webmcp-compat`. Two things were wrong with it, one
noticed by Hasan and one that followed.

## Options

**Package name**

| Candidate | Problem |
|---|---|
| `ng-webmcp-compat` | `ng-` is the Angular CLI's prefix and sits beside `@angular/*`; a package that deliberately mimics an `@angular/core` API could be mistaken for something the Angular team shipped. `-compat` implies it is only a shim, which `/bridge` is not. |
| `angular-webmcp` | still framework-first; reads like an official integration |
| **`webmcp-angular`** | "WebMCP, for Angular" — framework as suffix, the way community packages are usually named |

**Function names**

| Candidate | Problem |
|---|---|
| `declareExperimentalWebMcpTool` (Angular's exact name) | `Experimental` is Angular's stability marker for *their* API; ours is versioned `0.x` and says so. Hasan: *"I don't want to call it experimental."* |
| **`declareWebMcpTool` / `provideWebMcpTools`** | the same names with the marker removed |

## Decision

Package and repo are `webmcp-angular`, with no trace of `ng-` anywhere. The two
functions drop `Experimental`. Angular's own names are never renamed when cited —
`provideExperimentalWebMcpForms`, `withExperimentalAutoCleanupInjectors` — nor are
third-party packages.

## What it cost

The migration is no longer a pure specifier rewrite: the schematic has to alias
(`declareExperimentalWebMcpTool as declareWebMcpTool`) so call sites stay untouched,
and the parity api-diff has to normalise names before comparing signatures. Both are
built and tested. And the entire published artifact was rebuilt to remove the old
name.

## Revisit when

Angular drops `Experimental` from its own names. Then ours match exactly and the
aliasing in the schematic becomes dead code.
