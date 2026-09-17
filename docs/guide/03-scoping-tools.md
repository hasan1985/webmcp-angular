[← writing tools](./02-writing-tools.md) · [contents](./README.md) · next: [Testing →](./04-testing.md)

# 3. Scoping tools

A tool lives exactly as long as the injector you attached it to. So "scoping a tool"
is really "picking an injector".

## Why not just register everything at the root

**Cost.** Every tool's name, description and schema goes to the model on *every
turn*. Fifty always-on tools is a bill you pay forever.

**Accuracy.** A model choosing between six relevant tools does better than one
choosing between fifty, most of which can't apply on the current page. Irrelevant
options are distractors, not free.

The goal is that the agent sees what makes sense *here, now*.

## App scope

```ts
// app.config.ts — registered at bootstrap, never unregistered
providers: [
  provideWebMcpTools([searchTool]),
]
```

For genuinely global capabilities. Search, navigation, account info.

## Component scope

```ts
import { Component, inject } from '@angular/core';
import { declareWebMcpTool } from 'webmcp-angular';

@Component({ /* … */ })
export class CheckoutPage {
  constructor() {
    declareWebMcpTool({
      name: 'apply_discount_code',
      description: 'Apply a discount code. Only available while checkout is open.',
      inputSchema: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
      execute: ({ code }) => inject(CheckoutService).applyCode(code),
    });
  }
}
```

Registered when the component is created, unregistered when it's destroyed. **This is
the workhorse**, and it behaves correctly on every Angular version.

## Service scope

The same call in a service constructor. Lifetime is the service's: `providedIn:
'root'` gives you app scope; a service provided by a component gives you that
component's.

## ⚠️ Route-level `providers` leak unless cleanup is switched on

This looks like the obvious way to scope a tool to a route, and on Angular 20 and 21
it's a bug:

```ts
{
  path: 'checkout',
  providers: [provideWebMcpTools([applyDiscountTool])],   // ⚠️ leaks
  loadComponent: () => import('./checkout.page').then((m) => m.CheckoutPage),
}
```

The route's environment injector isn't destroyed when you navigate away, so the tool
stays registered for the life of the app. Measured in Chrome on Angular 20.3.31:

```
/game            →  get_board, make_move, reset_game
/leak            →  + probe_leak
back to /game    →  probe_leak STILL PRESENT        ← leaked
/notes           →  + add_note, list_notes          (component-scoped)
back to /game    →  add_note, list_notes gone       ← correct
```

The router fixes it with an opt-in feature, available from **Angular 21.1**:

```ts
provideRouter(routes, withExperimentalAutoCleanupInjectors())
```

On 20.x and 21.0 the feature doesn't exist and can't be recreated — its
`RouterFeatureKind` is an enum value the older router doesn't know.

**Declare route-scoped tools in the routed component instead.** The router already
creates and destroys that component, so its lifetime *is* the route's lifetime, on
every version. You lose nothing.

| | 20.x, 21.0 | 21.1+, 22 |
|---|---|---|
| Route `providers` | ✗ leaks | ✓ with `withExperimentalAutoCleanupInjectors()` |
| Component constructor | ✓ | ✓ |

## Conditional tools

Sometimes a tool should exist in a particular *state*, not on a particular page.
There's no `enabled` flag in the API, so attach to an injector whose lifetime is the
condition:

```ts
@Component({ /* … */ })
export class ConfirmPaymentDialog {
  constructor() {
    // The dialog's injector dies when the dialog closes, taking the tool with it.
    declareWebMcpTool({
      name: 'confirm_payment',
      description: 'Confirm the pending payment. Only valid while the dialog is open.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      execute: () => inject(CheckoutService).confirm(),
    });
  }
}
```

The general move: **find the thing whose lifetime you actually mean, and attach
there.** If nothing has that lifetime, create an injector that does.

## Reacting to the tool list changing

A panel, a status line, or a connected client may want to keep up:

```ts
const refresh = () => { /* re-read getTools() */ };

document.addEventListener('toolchange', refresh);
document.modelContext?.addEventListener?.('toolchange', refresh);   // ← both
```

**Listen on the ModelContext.** That is where the draft fires `toolchange` and where
`@mcp-b/webmcp-polyfill` fires it. A document-only listener never fires — measured:
document listener 0 calls, context listener 4, across the same navigation. The
document listener above is a no-cost hedge, which is why the library keeps both.

---

next: [Testing →](./04-testing.md)
