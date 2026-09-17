# 005 · Guard SSR with `typeof document`, not `ngServerMode`

**Status:** settled · **Date:** September 2026

## Situation

Angular 22's implementation opens with
`if (typeof ngServerMode !== 'undefined' && ngServerMode) return;`. `ngServerMode` is
a build-time global that Angular's own build defines; on Angular 20 and 21, in a
consumer's build, it is not reliably present.

## Options

| | |
|---|---|
| Copy Angular's check verbatim | on 20/21 the global may be undefined in *both* environments, so the guard never fires and a server render touches `document` and throws |
| **`typeof document === 'undefined'`** | the same fact from the other side — a server render has no document; works on every version, and needs no build global |
| Inject `PLATFORM_ID` and call `isPlatformBrowser` | correct, but adds an injection the original does not have, and `declareWebMcpTool` may be called with an explicit injector where that token is not obviously resolvable |

## Decision

`typeof document === 'undefined'`, with a comment naming it as the one deliberate
divergence from the v22 source. Same outcome — the browser API is never touched while
prerendering, silently. The packaging check ([011](./011-tarball-not-file-install.md))
prerenders a real SSR app to prove it.

## What it cost

One line that is not a line-for-line copy. A reader diffing us against Angular has
to know why.

## Revisit when

Support for Angular 20/21 is dropped. Then `ngServerMode` is always defined and the
original check can return.
