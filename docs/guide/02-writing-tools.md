[← getting started](./01-getting-started.md) · [contents](./README.md) · next: [Scoping tools →](./03-scoping-tools.md)

# 2. Writing tools

The mechanics are four fields. What makes a tool *good* is mostly the prose.

## The shape

```ts
{
  name: string,           // unique per document, [A-Za-z0-9_.-], 1–128 chars
  description: string,    // what the agent reads to decide whether to call it
  inputSchema: {...},     // JSON Schema for the arguments
  execute: (args, client) => unknown,
}
```

## Validate everything

**Nothing validates the agent's arguments.** Not the spec, not the browser, not
Angular. `inputSchema` is a hint to the model, not a runtime guard — an agent can
send `{ qty: -5 }` for a field you declared `minimum: 1`, and it arrives exactly as
sent.

So validate, and **return the problem as text instead of throwing**:

```ts
execute: ({ sku, qty }) => {
  const cart = inject(CartService);

  if (!Number.isInteger(qty) || qty < 1) {
    return `Rejected: qty must be a whole number of 1 or more. Received ${JSON.stringify(qty)}.`;
  }
  if (!cart.isStocked(sku)) {
    return `Rejected: "${sku}" is not a known SKU. Try search_products first.`;
  }

  cart.add(sku, qty);
  return `Added ${qty} × ${sku}.`;
}
```

A thrown exception ends the turn. A *described* failure lets the agent correct
itself on the next one:

```
agent → add_to_cart({ sku: "BLUE-SHIRT", qty: 1 })
      ← Rejected: "BLUE-SHIRT" is not a known SKU. Try search_products first.
agent → search_products({ query: "blue shirt" })
      ← [{"sku":"SHIRT-BL-M", …}]
agent → add_to_cart({ sku: "SHIRT-BL-M", qty: 1 })
      ← Added 1 × SHIRT-BL-M.
```

Good error text isn't politeness here. It's the control flow. Name what was wrong,
what was expected, and — when you can — what to do instead.

## Write descriptions for someone who can't see your UI

The agent picks between tools using only `name` and `description`. It has no
screenshot and no idea what your app looks like.

```ts
// weak — assumes context the agent does not have
description: 'Make a move.'

// strong — says what the numbers mean
description:
  'Place a mark on the tic-tac-toe board. Squares are numbered 0-8, left to right, ' +
  'top to bottom, so 0 is the top-left corner and 8 is the bottom-right. ' +
  "Fails if the square is taken, the game is over, or it is not that player's turn."
```

Mentioning the failure modes is not wasted space. It stops the agent trying them.

## Give agents a cheap way to look before acting

A read-only tool costs you very little and saves a lot of flailing:

```ts
{
  name: 'get_cart',
  description: 'Read the current cart contents and total. Call this before changing it.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  execute: () => inject(CartService).describe(),
}
```

Then return the **new state** from your mutating tools too:

```ts
return `Added ${qty} × ${sku}.\n${cart.describe()}`;
```

That saves the agent a follow-up read — a round trip, real latency, real tokens.

## Keep the tool thin

A tool should wrap something that already exists. If business logic lives inside
`execute`, the rest of your app can't reach it.

```ts
// good — one source of truth, and your buttons use it too
execute: ({ sku, qty }) => inject(CartService).add(sku, qty)
```

The service should know nothing about WebMCP. That separation is what lets you
expose an app to agents without rewriting it.

## Types from the schema

`execute`'s arguments are typed from your JSON Schema literal — no interface needed:

```ts
inputSchema: {
  type: 'object',
  properties: {
    square: { type: 'integer', minimum: 0, maximum: 8 },
    player: { type: 'string', enum: ['X', 'O'] },
  },
  required: ['square', 'player'],
},
execute: ({ square, player }) => {
  //       ^^^^^^ number
  //               ^^^^^^ string
}
```

Compile-time only. At runtime the agent can still send anything — see above.

### The one typing wart

`provideWebMcpTools` has **one** type parameter for the whole array, so
tools with *different* schemas collapse into a union and stop type-checking. That's
[angular#70125][issue], still open upstream, and this package reproduces it on
purpose — a "fixed" signature would accept code that Angular 22 rejects.

The cast-free fix is one call per tool, so each array stays homogeneous:

```ts
providers: [
  provideWebMcpTools([getCartTool]),
  provideWebMcpTools([addToCartTool]),
  provideWebMcpTools([removeFromCartTool]),
]
```

Pair it with `webMcpTool()` from `webmcp-angular/strict`, which pins each tool's
schema to its own type parameter so `execute` gets real argument types as you write
them:

```ts
import { webMcpTool } from 'webmcp-angular/strict';

export const addToCartTool = webMcpTool({
  name: 'add_to_cart',
  description: '…',
  inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
  execute: ({ sku }) => …,   // sku: string, not a union
});
```

It's a no-op at runtime and it does **not** fix the provider call — only the
authoring. Delete the wrappers if #70125 is ever fixed.

The alternative you'll see elsewhere, `as unknown as WebMcpToolDescriptor<never>[]`,
compiles but throws away the typing that made writing a schema worthwhile.

## Cancellation

`execute` gets a second argument with an `AbortSignal`. It fires when the agent gives
up **or** when the owning injector is destroyed:

```ts
execute: async ({ query }, { signal }) => {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  return await res.json();
}
```

Worth wiring for anything that hits the network. Free correctness.

## Return values, and where they go

`execute` returns `unknown` — a string, an object, anything. There's no
`{ content: [...] }` envelope to build; Angular's own docs note the result "is
typically just a raw `string`."

Your tool's job ends at `return`. What happens next is the part worth seeing once,
because it decides what you should return:

```
  your execute()          returns  "Added 2 × SHIRT-BL-M. Cart now has 2 items."
        │
        ▼
  document.modelContext   serializes it — a string as-is, an object via JSON.stringify
        │
        ▼
  the agent harness       puts that text into a tool_result and sends it to the model,
  (chat, browser agent,   together with the conversation so far
   MCP client)
        │
        ▼
  the model               reads it as text — this is the ONLY thing it learns from
                          the call — and decides: answer the user, or call again
```

In the Messages API, the harness's next request carries your string verbatim:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01…",
      "content": "Added 2 × SHIRT-BL-M. Cart now has 2 items, total £38.00."
    }
  ]
}
```

and the model's reply to the user is written from that alone:

```
model → "Done — two blue shirts are in your cart, £38.00 in total."
```

Three things follow from the model seeing nothing but your text:

**Say what changed, not just that it worked.** The model cannot see your UI update.
`"ok"` forces a follow-up read; the state in the reply makes it the last call:

```ts
return `Added ${qty} × ${sku}. Cart now has ${cart.count()} items, total ${cart.total()}.`;
```

**Prose beats raw JSON for a mutation; JSON is fine for a read.** A sentence can say
what happened and why; a list of records is best left as records:

```ts
// mutation — say what happened
return `Played ${player} on square ${square}.\n${store.describe()}`;

// read — structure is the point
return cart.items();   // → '[{"sku":"SHIRT-BL-M","qty":2},…]'
```

**Keep it as short as it can be and still be complete.** The text is sent to the
model, counted as input tokens, and stays in the conversation for every later turn.
A 20-row table when three rows answer the question is paid for on every request
after it.

The same path is why [failures go back as text](#validate-everything): a thrown error
reaches the model as *"Tool was executed but the invocation failed…"* and nothing
else, while a returned `Rejected: …` sentence tells it what to do instead. The full
round trip, with the harness and model as separate lanes, is
[architecture chapter 7, diagram 2](../architecture/07-lifecycle-in-page-agent.md#2-a-user-asks-the-agent-to-do-something).

[issue]: https://github.com/angular/angular/issues/70125

---

next: [Scoping tools →](./03-scoping-tools.md)
