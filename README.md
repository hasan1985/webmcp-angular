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

Every symbol in the **core** entry point is signature-identical to `@angular/core` v22 — including [a known upstream typing defect](https://github.com/angular/angular/issues/70125), which is reproduced deliberately rather than fixed, because a "better" signature that accepts code v22 rejects is a migration trap.

Additive ideas live in separate, clearly-marked entry points that you opt into knowing they won't survive the migration.

## Entry points

| Entry point | Migrates to v22? | Contents |
|---|---|---|
| `ng-webmcp-compat` | ✅ identical surface | `declareExperimentalWebMcpTool`, `provideExperimentalWebMcpTools`, types |
| `/strict` | ❌ remove on migrate | `webMcpTool()` identity helper working around angular#70125 |
| `/bridge` | ❌ no v22 equivalent | JSON-RPC over `postMessage`; routes tools to Claude Desktop / Cursor via the MCP-B relay |
| `/devtools` | ❌ dev only | inspector: list tools, view schemas, invoke manually |
| `/testing` | ❌ test only | polyfill harness, matchers, fake agent invoker |

`/bridge` is the one genuinely additive capability Angular has no plan for, and the only reason this package might outlive the migration.

## Status

`declareExperimentalWebMcpTool` and `provideExperimentalWebMcpTools` are **implemented and verified against `@angular/core@22.1.6`** — behaviourally, by a parity suite that runs one spec against both this implementation and Angular's own, and structurally, by a `.d.ts` diff. See `parity/README.md`.

```
✔ 12/12  ours @ Angular 20        ✔ 5/5 declarations match @angular/core@22.1.6
✔ 12/12  ours @ Angular 21
✔ 24/24  ours + @angular/core @ Angular 22
```

Not yet done: real-browser verification, SSR/polyfill hardening (M4), the migration schematic (M5), router cleanup (M6), and every optional entry point. See `docs/PLAN.md` §6.

## Layout

```
projects/ng-webmcp-compat/   the library (5 entry points)
parity/                      the M3 release gate — spec suite + .d.ts diff
docs/PLAN.md                 requirements, architecture, milestones, risks
docs/M0-FINDINGS.md          verified findings + corrections to the plan
```

## Development

```bash
npm install
npx ng build ng-webmcp-compat     # builds all 5 entry points to dist/
npm run verify                    # parity gate: .d.ts diff + spec suite on Angular 20/21/22
# the showcase app is a sibling repo: ../ng-webmcp-playground
```

Native WebMCP currently requires Chromium with `--enable-features=WebMCP`. Without it the library degrades to a no-op with one dev-mode warning — it never throws.

## License

MIT
