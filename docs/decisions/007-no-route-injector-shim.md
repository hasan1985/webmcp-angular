# 007 · Do not backport route-injector cleanup; document the component pattern

**Status:** settled, premise corrected 16 September 2026 · **Date:** September 2026 (measured on Angular 20.3.31)

## Situation

Putting `provideWebMcpTools` in a route's `providers` array looks like the obvious way
to scope a tool to a page. On Angular 20 and 21 the route's environment injector is
not destroyed on navigation, so the tool leaks — measured: `probe_leak` was still
registered after navigating away and back. The router's opt-in fix,
`withExperimentalAutoCleanupInjectors()`, was believed to be new in 22.

**Correction, 16 September 2026.** Checked against the published packages: the
feature is absent in `@angular/router` 21.0.0 and present from **21.1.0**. So the
users without a fix are on 20.x and 21.0, not everyone below 22. The decision below
stands — the component pattern is still the one that works everywhere — but the
"v22 addition" reasoning in the first option was wrong.

## Options

| | |
|---|---|
| Backport `withExperimentalAutoCleanupInjectors` to 20.x / 21.0 | impossible as a feature: `RouterFeatureKind` is a numeric enum and the older router only acts on kinds it knows |
| A router-events shim that destroys route injectors ourselves | the riskiest code in the plan — it reaches into router internals, and getting it wrong destroys injectors other code still holds |
| **Document "declare route-scoped tools in the routed component"** | zero code; works on every version; the component's lifetime *is* the route's lifetime |

## Decision

No shim. The guide and architecture chapter 4 teach the component-constructor pattern
as the workhorse, mark route `providers` as the trap with the measurement, and note
that from 21.1 the router feature is an alternative.

## What it cost

Route-level `providers` silently leaks on 20.x and 21.0 — and on any version where
the feature is not switched on — and the package does not warn: it cannot see where a
provider array came from. The only defence is the documentation.

## Revisit when

Angular backports the router feature to a 20.x patch, or the router exposes a stable
hook for route-injector teardown.
