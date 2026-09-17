[← inspecting](./07-inspecting.md) · [contents](./README.md) · next: [API reference →](./api-reference.md)

# 6. Migrating to Angular 22

You may never do this, and that's fine — several entry points here have no Angular
equivalent, so keeping the package is a perfectly good end state.

The point is that switching stays **cheap and available**. Angular 22 ships the same
API in `@angular/core`, and this package's core entry point mirrors it deliberately:
same parameters, same types, same behaviour, differing only in that Angular prefixes
the two functions with `Experimental` and we don't. So the move is mechanical, and a
schematic does it.

## Run the schematic

```bash
ng generate webmcp-angular:migrate --dry-run
```

Read what it plans to do, then run it for real:

```bash
ng generate webmcp-angular:migrate
```

It rewrites core imports to `@angular/core`, reports anything it doesn't fully
understand instead of guessing, and removes the dependency from `package.json` —
but only once nothing is left unresolved.

Real output, run against the sample app:

```
Rewrote imports to '@angular/core' in 3 file(s):
  /src/app/app.config.ts
  /src/app/game/game.tools.spec.ts
  /src/app/notes/notes.page.ts

4 import(s) need a decision from you:
  /src/main.ts:3 — imports 'webmcp-angular/bridge' — '/bridge' has no
    @angular/core equivalent, so this import must stay or be removed by hand.
  /src/main.ts:4 — imports 'webmcp-angular/polyfill' — …
  /src/app/game/game.tools.spec.ts:3 — imports 'webmcp-angular/testing' — …
  /src/app/game/game.tools.ts:2 — imports 'webmcp-angular/strict' — …

'webmcp-angular' was left in package.json because of the above. Resolve them,
re-run, and the dependency will be removed.
```

Note what that app is telling you: every core import moved on its own, and the four
that stayed are all capabilities Angular does not have. That is the migration
working, not failing.

## What migrates cleanly

Everything from the **core** entry point:

```ts
declareWebMcpTool
provideWebMcpTools
WebMcpToolDescriptor
WebMcpToolExecute
WebMcpClient
```

Only the module specifier changes. Your tool definitions, schemas, `execute` bodies,
and scoping all stay exactly as they are.

## What needs a decision

The other entry points have no `@angular/core` equivalent, so the schematic reports
them rather than guessing:

| Import | What to do |
|---|---|
| `/strict` | Keep it — it's a type-level no-op that still works on v22. Or drop the `webMcpTool()` wrappers if [angular#70125][issue] has been fixed. |
| `/polyfill` | Keep it until your target browsers ship WebMCP natively. |
| `/testing` | Keep it. Angular ships no test harness. |
| `/devtools` | Keep it. Angular ships no inspector. |
| `/bridge` | Keep it. Angular has no equivalent and none is planned. |

If you use any of these, `webmcp-angular` stays in your `package.json` — and that's
fine. The point was never that the dependency disappears; it's that **none of your
application code has to change**.

Also not rewritten, deliberately:

- **Namespace and default imports** (`import * as webmcp from …`) — reported, not
  touched.
- **Non-core symbols from the primary entry** (`isWebMcpSupported`,
  `resolveModelContext`, `normalizeInputSchema`, `displayTitle`) — these are ours,
  not Angular's. Replace or drop them before migrating.

## Things you can do on v22 that you couldn't before

Worth picking up once you're there:

**Route-level `providers` actually clean up.**

```ts
provideRouter(routes, withExperimentalAutoCleanupInjectors())
```

The [route-provider leak](./03-scoping-tools.md#route-level-providers-leak-unless-cleanup-is-switched-on)
is fixed by this — and you don't have to wait for 22: the feature is in
`@angular/router` from 21.1. If you worked around it with component-scoped tools, you
can keep them as they are — they still work, and arguably read better.

**Signal Forms can generate a tool for you.**

```ts
form(model, { experimentalWebMcpTool: { name: 'submit_order', description: '…' } })
```

From `@angular/forms/signals`. Angular infers the schema from the model's initial
value, derives `required` from validators, and wires validation and submission so the
agent sees errors and can retry. Needs concrete initial values — it can't infer from
`null`, `undefined` or empty arrays.

## If you'd rather do it by hand

It's a find-and-replace on the module specifier:

```
'webmcp-angular'  →  '@angular/core'
```

Leave every `'webmcp-angular/<entry-point>'` import alone.

[issue]: https://github.com/angular/angular/issues/70125

---

next: [API reference →](./api-reference.md)
