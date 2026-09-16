[← scoping tools](./03-scoping-tools.md) · [contents](./README.md) · next: [Inspecting and connecting →](./05-inspecting-and-connecting.md)

# 4. Testing

`webmcp-angular/testing` installs an in-memory `document.modelContext`, so you can
assert on what your app exposes to agents with no browser support for WebMCP and no
polyfill.

It's framework-agnostic — no Jasmine or Vitest dependency — so it works with whatever
you already use.

## The basic shape

```ts
import { TestBed } from '@angular/core/testing';
import { provideWebMcpTools } from 'webmcp-angular';
import { installWebMcpTestHarness, type WebMcpHarness } from 'webmcp-angular/testing';

describe('cart tools', () => {
  let webmcp: WebMcpHarness;
  let cart: CartService;

  beforeEach(() => {
    webmcp = installWebMcpTestHarness();

    TestBed.configureTestingModule({
      providers: [provideWebMcpTools([addToCartTool])],
    });

    // Environment initializers run lazily — touching the injector forces them.
    cart = TestBed.inject(CartService);
  });

  afterEach(() => webmcp.uninstall());

  it('registers the tool', () => {
    expect(webmcp.has('add_to_cart')).toBe(true);
  });

  it('adds to the cart', async () => {
    await webmcp.invoke('add_to_cart', { sku: 'A1', qty: 2 });
    expect(cart.count()).toBe(2);
  });
});
```

## Invoke through the harness, never call `execute` directly

This is the one rule that matters.

```ts
await webmcp.invoke('add_to_cart', { sku: 'A1', qty: 2 });   // ✓
await addToCartTool.execute({ sku: 'A1', qty: 2 });          // ✗
```

Calling `execute` yourself skips `runInInjectionContext`, so **every `inject()` in
the tool would throw `NG0203` in production while your test stayed green**. Going
through the harness exercises the same registration and invocation path a real page
uses.

## What it checks that a hand-rolled fake wouldn't

The harness implements the parts of the spec that change test outcomes:

- **Duplicate names reject** with `InvalidStateError`, as a browser does.
- **`AbortSignal` really unregisters** — destroy an injector in a test and the tool
  disappears, exactly as it would live.
- **`toolchange` fires on both** the model context and the document. The spec
  dispatches on the document; the polyfill only on the context. Firing both is
  deliberate so a listener written either way is exercised.

A fake that skipped these would let tests pass on code that breaks in a browser.

## Lifecycle tests

Because unregistration is real, you can assert on it:

```ts
it('unregisters when the component is destroyed', async () => {
  const fixture = TestBed.createComponent(CheckoutPage);
  fixture.detectChanges();
  expect(webmcp.has('apply_discount_code')).toBe(true);

  fixture.destroy();
  expect(webmcp.has('apply_discount_code')).toBe(false);
});
```

## Asserting on failure text

Rejections are results, not exceptions ([chapter 2](./02-writing-tools.md)), so test
them as values — including that the state didn't change:

```ts
it('rejects an unknown SKU without touching the cart', async () => {
  const result = (await webmcp.invoke('add_to_cart', { sku: 'NOPE', qty: 1 })) as string;

  expect(result).toContain('not a known SKU');
  expect(result).toContain('search_products');   // the agent needs the next step
  expect(cart.count()).toBe(0);
});
```

## Inspecting calls

```ts
webmcp.calls();      // [{ name, args, result }] in order — result or error
webmcp.clearCalls();
```

Useful for asserting an agent-driven flow called what you expected, in what order.

## When a tool isn't registered

`invoke()` rejects with a message naming what *is* registered:

```
No WebMCP tool named "add_to_car" is registered. Currently registered: add_to_cart, get_cart.
```

That's deliberate: a tool that silently failed to register is the most common WebMCP
bug, and the default failure would be an unhelpful `undefined`.

## API

| Member | |
|---|---|
| `toolNames()` | every registered name, sorted |
| `has(name)` | is it registered right now |
| `get(name)` | the registered tool, or `undefined` |
| `invoke(name, args?, { signal? })` | run it as an agent would |
| `calls()` | every invocation made through `invoke` |
| `clearCalls()` | forget them; registrations untouched |
| `uninstall()` | remove the harness, restoring whatever was on `document` |

`installWebMcpTestHarness()` needs a DOM — jsdom, happy-dom, or a browser runner. It
throws a clear error in a plain Node environment rather than failing obscurely.

---

next: [Inspecting and connecting →](./05-inspecting-and-connecting.md)
