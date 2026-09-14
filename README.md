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

Scaffold + verified types and runtime adapter. The two public runtime functions are **not yet implemented** — see `docs/PLAN.md` §6 for milestones and `docs/M0-FINDINGS.md` §5 for what still needs verifying against a real Angular 22 `.d.ts`.

The release gate is **M3, the parity suite**: one spec file run against both this implementation and a v22 fixture app using `@angular/core`, across an Angular 20/21/22 CI matrix. Without it there is no evidence backing the compatibility claim, which is the entire product.

## Layout

```
projects/ng-webmcp-compat/   the library (5 entry points)
projects/demo/               sample app + e2e target
docs/PLAN.md                 requirements, architecture, milestones, risks
docs/M0-FINDINGS.md          verified findings + corrections to the plan
```

## Development

```bash
npm install
npx ng build ng-webmcp-compat     # builds all 5 entry points to dist/
npx ng test ng-webmcp-compat
npx ng serve demo
```

Native WebMCP currently requires Chromium with `--enable-features=WebMCP`. Without it the library degrades to a no-op with one dev-mode warning — it never throws.

## License

MIT
