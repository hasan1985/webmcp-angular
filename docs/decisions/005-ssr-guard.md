# 005 · Guard SSR with `typeof document`, not `ngServerMode`

**Status:** settled · **Date:** September 2026

## Situation

Angular 22 opens with `if (typeof ngServerMode !== 'undefined' && ngServerMode) return;`.
That build-time global is defined by Angular's own build; in a consumer's build on
20/21 it is not reliably present.

## Options

| | |
|---|---|
| Copy the check verbatim | on 20/21 the global may be undefined in both environments; the guard never fires; a server render touches `document` and throws |
| **`typeof document === 'undefined'`** | the same fact from the other side; works on every version; no build global |
| `PLATFORM_ID` + `isPlatformBrowser` | correct, but adds an injection the original lacks, and `declareWebMcpTool` may run with an explicit injector where the token is not resolvable |

## Decision

`typeof document === 'undefined'`, commented as the one deliberate divergence from v22.
Same outcome: the browser API is never touched while prerendering. The packaging check
([011](./011-tarball-not-file-install.md)) prerenders a real SSR app to prove it.

## What it cost

One line that is not a copy; a reader diffing against Angular must know why.

## Revisit when

Angular 20/21 support is dropped; `ngServerMode` is then always defined.
