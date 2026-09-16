[contents](./README.md) · next: [Writing tools →](./02-writing-tools.md)

# 1. Getting started

Five minutes to an agent that can do something in your app.

## 1. Install

```bash
npm install webmcp-angular
```

Peer dependencies: `@angular/core` and `@angular/common` at `>=20 <24`.
`@angular/router` is optional, and only needed if you scope tools to routes.

## 2. Install the polyfill

No browser ships WebMCP unflagged yet — Chromium has it behind
`--enable-features=WebMCP`, and elsewhere `document.modelContext` simply doesn't
exist. Without it your tools register into nothing: silently, with no error.

```bash
npm install @mcp-b/webmcp-polyfill
```

Then install it **before** bootstrapping:

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { installWebMcpPolyfill } from 'webmcp-angular/polyfill';

import { App } from './app/app';
import { appConfig } from './app/app.config';

installWebMcpPolyfill()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
```

Two things that look like style choices and aren't:

**Before bootstrap, not in a provider.** Tools register from an environment
initializer *during* bootstrap. Installing the polyfill needs an async import, so a
polyfill provider would resolve after the tools had already tried and silently
failed. There's no error — the tools just aren't there.

**A `.then` chain, not top-level `await`.** Angular's default browserslist targets
reject top-level await and the build fails with *"Top-level await is not available
in the configured target environment."*

`installWebMcpPolyfill()` leaves a native implementation alone if one exists, and
resolves to `'unavailable'` rather than throwing if the package isn't installed.

## 3. Register a tool

```ts
// app.config.ts
import { ApplicationConfig, inject } from '@angular/core';
import { provideWebMcpTools } from 'webmcp-angular';

import { CartService } from './cart.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideWebMcpTools([
      {
        name: 'add_to_cart',
        description:
          'Add a product to the shopping cart. Use the SKU shown on the product page.',
        inputSchema: {
          type: 'object',
          properties: {
            sku: { type: 'string' },
            qty: { type: 'integer', minimum: 1 },
          },
          required: ['sku', 'qty'],
        },
        execute: ({ sku, qty }) => {
          const cart = inject(CartService);     // ← works: see below
          cart.add(sku, qty);
          return `Added ${qty} × ${sku}. Cart now has ${cart.count()} items.`;
        },
      },
    ]),
  ],
};
```

`execute` runs inside the owning injector's **injection context**, so `inject()`
works in the body. That's the whole point of the Angular integration: a tool is a
thin wrapper over services you already have, not a reimplementation of them.

## 4. Check it worked

Open the app and run this in the browser console:

```js
await document.modelContext.getTools();
```

You should see `add_to_cart`. If the array is empty, jump to
[Troubleshooting](#troubleshooting) below.

Better: mount the inspector and click things.

```ts
// main.ts, after bootstrap
import { isDevMode } from '@angular/core';

if (isDevMode()) {
  const { mountWebMcpDevtools } = await import('webmcp-angular/devtools');
  mountWebMcpDevtools();     // Ctrl/Cmd + Shift + M
}
```

It lists every registered tool with its schema, prefills the arguments, and runs
them on click — so you can exercise a tool without an agent, an API key, or a chat
window. More in [chapter 5](./05-inspecting-and-connecting.md).

## Troubleshooting

**`getTools()` returns an empty array.**
Usually the polyfill: `document.modelContext` doesn't exist, so registration was a
silent no-op. Check `isWebMcpSupported()`. Registration is *designed* to fail
quietly — matching `@angular/core`, which returns early without a word — so nothing
will look broken.

**`getTools()` throws `Cannot read properties of undefined`.**
Same cause. Use `document.modelContext?.getTools()`.

**A stray `InvalidStateError` in the console, and one tool is missing.**
Two tools registered under the same name. Names are unique per *document*, not per
module. `provideWebMcpTools` doesn't await its registrations, so the
collision surfaces as an unhandled rejection rather than a throw — bootstrap
succeeds and the second tool is simply absent.

**`NG0203` when the agent calls a tool.**
Something is calling `execute` directly rather than going through the browser, which
skips `runInInjectionContext` and breaks every `inject()` in the body. Call tools via
`executeTool` or the [test harness](./04-testing.md).

**Tools vanish after navigating.**
Expected if you scoped them to a route — see [chapter 3](./03-scoping-tools.md).

A fuller symptom index lives in
[the architecture course](../architecture/06-what-bites-you.md).

---

next: [Writing tools →](./02-writing-tools.md)
