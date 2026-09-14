# ng-webmcp-compat

An **API-compatible backport of Angular v22's experimental [WebMCP](https://angular.dev/ai/webmcp) support** for Angular 20 and 21.

WebMCP is a [W3C Web Machine Learning CG draft](https://webmachinelearning.github.io/webmcp/) that lets a page expose typed, callable tools to AI agents through `document.modelContext`. Angular v22 ships first-party support. This package brings that same API to Angular 20+.

## The governing rule

> **Everything in this package exists to be deleted.**

Success is not "the best Angular WebMCP library." It is: *the day your app reaches Angular 22, swapping `ng-webmcp-compat` for `@angular/core` changes no application code except imports.*

```ts
import { provideExperimentalWebMcpTools } from 'ng-webmcp-compat';
// at Angular 22 ──▶
import { provideExperimentalWebMcpTools } from '@angular/core';
```

And you do not have to do it by hand:

```bash
ng generate ng-webmcp-compat:migrate --dry-run
```

It rewrites core imports, reports anything from a non-core entry point instead of
guessing, and removes the dependency only once nothing is left unresolved.

Every symbol in the **core** entry point is signature-identical to `@angular/core` v22 — including [a known upstream typing defect](https://github.com/angular/angular/issues/70125), which is reproduced deliberately rather than fixed, because a "better" signature that accepts code v22 rejects is a migration trap.

Additive ideas live in separate, clearly-marked entry points that you opt into knowing they won't survive the migration.

## Entry points

| Entry point | Migrates to v22? | Contents |
|---|---|---|
| `ng-webmcp-compat` | ✅ identical surface | `declareExperimentalWebMcpTool`, `provideExperimentalWebMcpTools`, types |
| `/strict` | ❌ remove on migrate | `webMcpTool()` identity helper mitigating angular#70125 |
| `/polyfill` | ❌ remove on migrate | `installWebMcpPolyfill()` — installs `document.modelContext` where the browser has none |
| `/bridge` | ❌ no v22 equivalent | `createWebMcpBridge()` — MCP over JSON-RPC 2.0, so tools reach Claude Desktop / Cursor via an extension or the MCP-B relay |
| `/devtools` | ❌ dev only | inspector: list tools, view schemas, invoke manually |
| `/testing` | ❌ test only | `installWebMcpTestHarness()` — assert on what your app exposes, with no browser |

`/bridge` is the one genuinely additive capability Angular has no plan for, and the only reason this package might outlive the migration.

## Status

`declareExperimentalWebMcpTool` and `provideExperimentalWebMcpTools` are **implemented and verified against `@angular/core@22.1.6`** — behaviourally, by a parity suite that runs one spec against both this implementation and Angular's own, and structurally, by a `.d.ts` diff. See `parity/README.md`.

```
✔ 12/12  ours @ Angular 20        ✔ 5/5 declarations match @angular/core@22.1.6
✔ 12/12  ours @ Angular 21
✔ 24/24  ours + @angular/core @ Angular 22
```

Verified in a real browser via the sibling [`ng-webmcp-playground`](../ng-webmcp-playground):
tools register, execute, and unregister on navigation. Hardened for server rendering and
for browsers with no WebMCP at all — `npm run check:packaging` packs the library, installs
the **tarball** into a real Angular SSR app and prerenders it.

### Known limitation: route-level providers

Tools registered through a route's `providers` array **are not unregistered when you
navigate away** on Angular 20 and 21 — measured, not assumed (`docs/M0-FINDINGS.md` §7).
The route's environment injector outlives the route; Angular 22 fixes this with
`withExperimentalAutoCleanupInjectors()`, which cannot be backported (its
`RouterFeature` kind is a v22 enum value).

Declare page-scoped tools with `declareExperimentalWebMcpTool()` in the routed
component instead — that cleans up correctly on every supported version.

Testing your own tools needs no browser:

```ts
import {installWebMcpTestHarness} from 'ng-webmcp-compat/testing';

const webmcp = installWebMcpTestHarness();
afterEach(() => webmcp.uninstall());

expect(webmcp.has('add_to_cart')).toBe(true);
expect(await webmcp.invoke('add_to_cart', {sku: 'A1', qty: 2})).toEqual({ok: true});
```

And the same tools can be exposed to MCP clients outside the page:

```ts
import {createWebMcpBridge} from 'ng-webmcp-compat/bridge';

createWebMcpBridge({allowedOrigins: [window.location.origin]}).start();
```

WebMCP itself has no wire format — `document.modelContext` is an in-page API for the
browser's own agent. The bridge speaks MCP over JSON-RPC 2.0 in postMessage envelopes
compatible with `@mcp-b/transports`, so an extension or the local relay can reach your
tools. **This is the one capability with no Angular 22 equivalent**, and the reason
this package might outlive the migration.

Not yet done: the `/devtools` inspector. See `docs/PLAN.md` §6.

## Layout

```
projects/ng-webmcp-compat/   the library (5 entry points)
parity/                      the M3 release gate — spec suite + .d.ts diff
fixtures/ssr-consumer/       real Angular SSR app, prerendered against the tarball
scripts/check-packaging.mjs  packs, installs the tarball, prerenders, asserts
projects/…/schematics/       ng generate ng-webmcp-compat:migrate
docs/PLAN.md                 requirements, architecture, milestones, risks
docs/M0-FINDINGS.md          verified findings + corrections to the plan
```

## Development

```bash
npm install
npx ng build ng-webmcp-compat     # builds all 5 entry points to dist/
npm run verify                    # everything: .d.ts diff, spec suite on Angular 20/21/22,
                                  # SSR + unsupported-browser specs, tarball/prerender check
npm run check:packaging           # just the tarball install + SSR prerender
# the showcase app is a sibling repo: ../ng-webmcp-playground
```

Native WebMCP currently requires Chromium with `--enable-features=WebMCP`. Without it the library degrades to a no-op with one dev-mode warning — it never throws.

## License

MIT
