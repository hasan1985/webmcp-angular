# Parity suite — the M3 release gate

This proves the compatibility claim instead of asserting it: that
`webmcp-angular` matches `@angular/core`'s experimental WebMCP API in both
**behaviour** and **types**.

Without this, "signature-identical to v22" rests on a one-time manual source read
that rots the moment Angular touches the API — which they explicitly reserve the
right to do outside a major, since it is `@experimental`. The failure mode is
nasty: everything looks fine until someone upgrades and their app breaks on code
that type-checked yesterday.

## Two halves

**1. One spec, run against every implementation.** `shared/parity-suite.ts` is
written against an interface both implementations satisfy, and is executed three
times:

| Run | Implementation | Angular |
|---|---|---|
| `test:v20` | ours | 20.3.31 |
| `test:v21` | ours | 21.2.23 |
| `test:v22` | ours **and** `@angular/core` | 22.1.6 |

The v22 run is the important one — our implementation and Angular's own are
measured against the same assertions in the same process. If they diverge, the
compatibility claim is false and CI says so.

`shared/fake-model-context.ts` is a framework-free stand-in for
`document.modelContext` implementing the parts of the W3C draft the suite needs:
name-collision rejection, and `AbortSignal`-driven unregistration (the spec has no
`unregisterTool`).

**2. A `.d.ts` diff.** `scripts/api-diff.mjs` lifts the five WebMCP declarations
out of `@angular/core`'s shipped `types/core.d.ts` and out of our built
`index.d.ts`, normalizes away comments, formatting, and the renaming Angular
applies on export (`Client` → `WebMcpClient`, `ToolDescriptor` →
`WebMcpToolDescriptor`, `Execute` → `WebMcpToolExecute`), and compares them.
Exits non-zero on any drift.

## Running

```bash
npm run verify          # from the workspace root: api-diff + all three spec runs
npm run test:api-diff   # types only (builds the library first)
npm run test:parity     # behaviour only, all three Angular versions
```

## Note on module resolution

Each vitest config **must** alias `@angular/core` to this project's own install.
Library sources live outside `parity/`, so without the alias they resolve up to the
workspace's Angular 20 while the injector comes from parity's Angular 22 — two
Angular instances whose DI tokens do not match, and `provideEnvironmentInitializer`
silently never fires. That bug produced three green-looking false failures while
this suite was being written.
