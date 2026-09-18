# 003 · `webmcp-angular`; no `ng-` prefix; no `Experimental` in our names

**Status:** settled · **Date:** 15 September 2026

## Situation

The workspace was created as `ng-webmcp-compat`, with Angular's exact function names.

## Options

| Package name | |
|---|---|
| `ng-webmcp-compat` | `ng-` is the CLI's prefix and sits beside `@angular/*`; a package mimicking an `@angular/core` API could pass for official. `-compat` implies a shim, which `/bridge` is not |
| `angular-webmcp` | still framework-first, reads official |
| **`webmcp-angular`** | "WebMCP, for Angular" — framework as suffix, the community convention |

| Function names | |
|---|---|
| `declareExperimentalWebMcpTool` (Angular's) | `Experimental` is Angular's stability marker for *their* API; ours is `0.x`. Hasan: *"I don't want to call it experimental."* |
| **`declareWebMcpTool` / `provideWebMcpTools`** | the marker removed |

## Decision

Package and repo `webmcp-angular`, no trace of `ng-`. The two functions drop
`Experimental`. Angular's own names (`provideExperimentalWebMcpForms`,
`withExperimentalAutoCleanupInjectors`) and third-party packages are never renamed
when cited.

## What it cost

The migration is no longer a pure specifier rewrite: the schematic aliases
(`declareExperimentalWebMcpTool as declareWebMcpTool`) so call sites stay untouched,
and the api-diff normalises names before comparing. Both tested. The published artifact
was rebuilt to remove the old name.

## Revisit when

Angular drops `Experimental` from its names; the aliasing becomes dead code.
