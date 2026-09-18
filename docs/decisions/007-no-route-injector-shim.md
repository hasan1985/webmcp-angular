# 007 · Do not backport route-injector cleanup; document the component pattern

**Status:** settled, premise corrected 16 September 2026 · **Date:** September 2026 (measured on Angular 20.3.31)

## Situation

`provideWebMcpTools` in a route's `providers` looks like the way to scope a tool to a
page. The route's environment injector is not destroyed on navigation, so the tool
leaks — measured: `probe_leak` still registered after navigating away and back. The
router's opt-in fix, `withExperimentalAutoCleanupInjectors()`, was believed new in 22.

**Correction, 16 September 2026.** Checked against published packages: absent in
`@angular/router` 21.0.0, present from **21.1.0**. Users without a fix are on 20.x and
21.0, not everyone below 22. The decision stands; the "v22 addition" reasoning was wrong.

## Options

| | |
|---|---|
| Backport the feature to 20.x / 21.0 | impossible: `RouterFeatureKind` is a numeric enum and the older router only acts on kinds it knows |
| A router-events shim destroying route injectors ourselves | the riskiest code in the plan; reaches into router internals; a mistake destroys injectors other code holds |
| **Document "declare route-scoped tools in the routed component"** | zero code; every version; the component's lifetime *is* the route's |

## Decision

No shim. The guide and architecture chapter 4 teach the component pattern, mark route
`providers` as the trap with the measurement, and note the router feature from 21.1.

## What it cost

Route `providers` silently leak on 20.x, 21.0, and wherever the feature is off; the
package cannot see where a provider array came from, so documentation is the only defence.

## Revisit when

Angular backports the feature to 20.x, or the router exposes a stable teardown hook.
