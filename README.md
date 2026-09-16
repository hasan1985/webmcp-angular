# webmcp-angular

Expose your Angular app's features to AI agents, as typed functions they can call.

Brings Angular 22's [WebMCP][ng-webmcp] API to **Angular 20 and 21** — plus a test
harness, a dev inspector, and a bridge to desktop MCP clients, none of which Angular
provides.

```bash
npm install webmcp-angular @mcp-b/webmcp-polyfill
```

## What it looks like

```ts
provideWebMcpTools([
  {
    name: 'add_to_cart',
    description: 'Add a product to the cart. Use the SKU shown on the product page.',
    inputSchema: {
      type: 'object',
      properties: { sku: { type: 'string' }, qty: { type: 'integer', minimum: 1 } },
      required: ['sku', 'qty'],
    },
    execute: ({ sku, qty }) => {
      const cart = inject(CartService);     // your existing service
      cart.add(sku, qty);
      return `Added ${qty} × ${sku}. Cart now has ${cart.count()} items.`;
    },
  },
])
```

An agent can now add things to the cart — by calling your function, not by guessing
where to click. `CartService` knows nothing about any of this.

**→ [Getting started](./docs/guide/01-getting-started.md)** walks through it properly,
including the polyfill step you can't skip.

## Documentation

| | |
|---|---|
| **[Using webmcp-angular](./docs/guide/README.md)** | Install, write tools, scope them, test them, ship them |
| **[API reference](./docs/guide/api-reference.md)** | Every export, by entry point |
| **[Status and open threads](./docs/STATUS.md)** | Current state, how to run the demo end to end, what is unfinished |
| **[How WebMCP works](./docs/architecture/README.md)** | A short course on the browser API and the Angular integration — plus a [diagrammed visual guide](https://claude.ai/code/artifact/190f4737-c9ea-4892-aa2b-f9c854716f83) |

There's also a [runnable sample app](../webmcp-angular-playground) — tic-tac-toe an
agent can play, page-scoped tools, a chat panel, and the inspector.

## Entry points

| | Angular equivalent | |
|---|---|---|
| `webmcp-angular` | ✓ mirrors `@angular/core` v22 | `declareWebMcpTool`, `provideWebMcpTools`, types |
| `/strict` | — | `webMcpTool()`, working around [angular#70125][issue] |
| `/polyfill` | — | `installWebMcpPolyfill()` |
| `/testing` | — | test harness; Angular ships none |
| `/devtools` | — | inspector; Angular ships none |
| `/bridge` | — | MCP over JSON-RPC, so Claude Desktop and Cursor can reach your tools |

The core entry point mirrors `@angular/core` v22 on purpose — same parameters, types
and behaviour, right down to [reproducing a known upstream typing defect][issue],
because a "fixed" signature would accept code Angular rejects. The only difference is
the name: Angular prefixes its two functions with `Experimental`, this package
doesn't.

That keeps **moving to Angular's native WebMCP an open, cheap option** rather than a
rewrite — [a schematic does it](./docs/guide/06-migrating-to-angular-22.md) when and
if you want it. It isn't a plan to disappear: four of the six entry points above have
no Angular equivalent, so keeping this alongside the native API is a perfectly normal
end state.

## Requirements

- Angular **20, 21 or 22**. On 22 you can use `@angular/core` directly.
- A browser with WebMCP, or the polyfill. No browser ships it unflagged yet.

## Known limitation

Tools registered through a route's `providers` array **are not unregistered when you
navigate away** on Angular 20 and 21 — measured, not assumed. Declare page-scoped
tools in the routed component instead; that cleans up correctly on every version.
[Details](./docs/guide/03-scoping-tools.md#️-route-level-providers-leak-before-angular-22).

## Stability

WebMCP is a [W3C Community Group draft][spec] and Angular's support is
`@experimental` — the API may change outside a major version, and already has twice.
This package is `0.x` and tracks it. Pin the version.

The draft is also **contested between engines**: Chromium is implementing it, Mozilla
recorded [neutral][moz], and WebKit recorded [oppose][wk] with concerns spanning
privacy, security, API design and the venue itself. In practice that makes this a
Chromium-plus-polyfill bet rather than a bet on a future standard — which is why the
polyfill is a first-class step rather than a stopgap.
[The full analysis](./docs/architecture/08-will-this-be-standardised.md).

A parity suite runs the same spec against this implementation and against
`@angular/core` v22, across an Angular 20/21/22 matrix, plus a `.d.ts` diff — weekly,
so upstream drift surfaces on a Monday rather than mid-migration.

## Development

```bash
npm install
npm run build:lib          # all entry points + schematics → dist/
npm run verify             # .d.ts diff, spec suite on 20/21/22, SSR + packaging checks
npm run check:packaging    # pack the tarball, install it in a real SSR app, prerender
```

```
projects/webmcp-angular/     the library
parity/                      the compatibility gate — spec suite + .d.ts diff
fixtures/ssr-consumer/       real Angular SSR app, prerendered against the tarball
docs/guide/                  how to use it
docs/architecture/           how it works
docs/STATUS.md               working state and open threads
docs/PLAN.md                 requirements, milestones, risks
docs/M0-FINDINGS.md          verified findings, with evidence
```

## License

MIT

[ng-webmcp]: https://angular.dev/ai/webmcp
[spec]: https://webmachinelearning.github.io/webmcp/
[issue]: https://github.com/angular/angular/issues/70125
[moz]: https://github.com/mozilla/standards-positions/issues/1412
[wk]: https://github.com/WebKit/standards-positions/issues/670
