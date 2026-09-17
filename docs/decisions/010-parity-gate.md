# 010 · One shared spec, run against ours and against `@angular/core`, weekly

**Status:** settled · **Date:** September 2026

## Situation

"API-compatible with Angular 22" is the package's entire claim. A claim like that
rots silently: Angular marks the API `@experimental` and reserves the right to change
it outside a major version.

## Options

| | |
|---|---|
| Unit-test our implementation against our own expectations | proves we do what we think; proves nothing about Angular |
| Snapshot Angular's `.d.ts` and diff | catches signature drift; misses semantic drift (ordering, silence, cancellation) |
| **One vitest suite written against an `interface WebMcpImpl {declareTool, provideTools}`, run once with our functions on Angular 20, 21 and 22, and once with `@angular/core`'s on 22** — plus an `api-diff` that normalises the two names and compares signatures | a behavioural divergence fails the *same* spec on one side and not the other; a signature divergence fails the diff |

## Decision

The parity suite is the release gate. `npm run verify` = api-diff + the suite on
three Angular versions + the packaging/SSR check. A GitHub Actions matrix runs it on
push and **every Monday at 06:00 UTC**, so Angular changing under us shows up within a
week whether or not anyone touched the repo.

Two details that made it work: each vitest config aliases `@angular/core` to the
parity install (the library source otherwise resolved the workspace's v20 while the
injector under test was v22), and the shared token is explicitly provided, not
`providedIn: 'root'`, because a bare `Injector.create()` is not root-scoped and a
root token would fail on *both* sides and mask a real divergence.

## What it cost

A second `package.json` (`parity/`) with its own installs of three Angular versions,
and a weekly cron that currently has no owner — STATUS.md's main open risk.

## Revisit when

Someone is named to receive the red cron. Until then the gate works and nobody is
listening.
