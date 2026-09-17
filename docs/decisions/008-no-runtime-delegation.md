# 008 · Drop runtime detection of Angular's implementation

**Status:** settled · **Date:** September 2026

## Situation

The plan had a `CoreDelegationGuard`: on Angular 22+, detect `@angular/core`'s own
WebMCP and delegate to it, with a dev-mode notice saying "you can migrate now". It was
meant to prevent double registration if an app mixed imports mid-migration.

## Options

| | |
|---|---|
| Keep the guard and the notice | a second code path, a second failure mode, and the notice fires in the unsupported-browser path too |
| **Remove it; rely on the parity suite and the schematic** | the parity suite already runs *our* code on Angular 22 and it passes — there is no behaviour to fall back to; the schematic rewrites atomically so a mixed-import state never persists |

## Decision

Removed. Two facts decided it: the unsupported-browser spec asserts the library logs
*nothing*, because v22 returns silently and silence is part of the contract, so any
notice would break parity; and delegation to an implementation that behaves
identically buys nothing.

## What it cost

An app that hand-mixes `webmcp-angular` and `@angular/core` imports for the same tool
name gets the duplicate-name rejection, same as any other collision. The schematic
is the supported path.

## Revisit when

Angular's implementation diverges from ours in a way the parity suite catches and we
choose not to follow. Then delegation on v22+ would become the compatibility path.
