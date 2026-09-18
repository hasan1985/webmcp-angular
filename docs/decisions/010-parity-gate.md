# 010 · One shared spec, run against ours and against `@angular/core`, weekly

**Status:** settled · **Date:** September 2026

## Situation

"API-compatible with Angular 22" is the whole claim, and it rots silently: the API is
`@experimental` and may change outside a major.

## Options

| | |
|---|---|
| Unit-test our own expectations | proves nothing about Angular |
| Snapshot and diff Angular's `.d.ts` | catches signature drift; misses semantic drift (ordering, silence, cancellation) |
| **One vitest suite against `interface WebMcpImpl {declareTool, provideTools}`, run with ours on 20/21/22 and with `@angular/core`'s on 22, plus an `api-diff` that normalises names and compares signatures** | a behavioural divergence fails the same spec on one side only; a signature divergence fails the diff |

## Decision

The parity suite is the release gate: `npm run verify` = api-diff + suite on three
versions + packaging/SSR check. GitHub Actions runs it on push and **every Monday
06:00 UTC**. Two details that made it work: each vitest config aliases `@angular/core`
to the parity install (source otherwise resolved workspace v20 while the injector was
v22); the shared token is explicitly provided, not `providedIn: 'root'`, because a bare
`Injector.create()` is not root-scoped and a root token fails on both sides, masking
divergence.

## What it cost

A second `package.json` (`parity/`) with three Angular installs, and a weekly cron with
no owner — STATUS's main open risk.

## Revisit when

Someone is named to receive the red cron.
