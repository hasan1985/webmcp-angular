[← the lifecycle](./02-the-lifecycle.md) · [contents](./README.md) · next: [Scope and navigation →](./04-scope-and-navigation.md)

# 3. Anatomy of a tool call

Registration is half the story. Here is the other half: what actually happens between
an agent deciding to call something and your service running.

## The round trip

```
  ┌─────────┐
  │  AGENT  │  decides to call add_to_cart({sku: "A1", qty: 2})
  └────┬────┘
       │
       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  BROWSER   document.modelContext                                 │
  │            looks up the tool by name, JSON-parses the arguments  │
  └────┬─────────────────────────────────────────────────────────────┘
       │  execute(args, {signal})
       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  ANGULAR'S WRAPPER                                               │
  │                                                                  │
  │   signal = AbortSignal.any([injectorTeardown, agentSignal])      │
  │   runInInjectionContext(injector, () => …)                       │
  └────┬─────────────────────────────────────────────────────────────┘
       │
       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  YOUR TOOL                                                       │
  │                                                                  │
  │   execute: ({sku, qty}) => {                                     │
  │     const cart = inject(CartService);   ← works, because ↑       │
  │     if (!Number.isInteger(qty)) return "qty must be an integer"; │
  │     cart.add(sku, qty);                                          │
  │     return `Added ${qty} × ${sku}.`;                             │
  │   }                                                              │
  └────┬─────────────────────────────────────────────────────────────┘
       │  returns anything
       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  BROWSER   serializes the return value                           │
  └────┬─────────────────────────────────────────────────────────────┘
       │
       ▼
  ┌─────────┐
  │  AGENT  │  reads "Added 2 × A1." and decides what to do next
  └─────────┘
```

Nothing in that path touches the DOM, and the UI updates because your *service*
changed — the same service the buttons use.

## The signatures, precisely

From `@angular/core@22.1.6`'s shipped `.d.ts`:

```ts
interface WebMcpClient {           // exported as WebMcpClient, internally `Client`
  signal: AbortSignal;
}

type WebMcpToolExecute<InputSchema extends JsonSchemaForInference> = (
  args: InferArgsFromInputSchema<InputSchema>,
  client: WebMcpClient,
) => unknown;

interface WebMcpToolDescriptor<InputSchema extends JsonSchemaForInference> {
  name: string;
  description: string;
  inputSchema: InputSchema;
  execute: WebMcpToolExecute<InputSchema>;
}
```

Two details people get wrong because the documentation once implied otherwise:

**`execute` takes a second parameter.** `client.signal` is an `AbortSignal`. Honour it
for anything long-running:

```ts
execute: async ({query}, {signal}) => {
  const res = await fetch(`/api/search?q=${query}`, {signal});   // ← cancellable
  return await res.json();
}
```

**`execute` returns `unknown`, not a `{content: [...]}` envelope.** There is no
`WebMcpToolResult` type in Angular. Return a string, an object, anything — the
browser serializes it. Angular's own JSDoc says the result "is typically just a raw
`string`."

## Types come from the schema

`InferArgsFromInputSchema` turns your JSON Schema literal into a TypeScript type, so
`execute`'s arguments are typed without you writing an interface:

```ts
inputSchema: {
  type: 'object',
  properties: {
    square: {type: 'integer', minimum: 0, maximum: 8},
    player: {type: 'string', enum: ['X', 'O']},
  },
  required: ['square', 'player'],
},
execute: ({square, player}) => {
  //       ^^^^^^  number
  //               ^^^^^^  string
}
```

Remember that this is a *compile-time* convenience only. At runtime the agent can
send whatever it likes ([chapter 1](./01-what-webmcp-is.md)).

⚠️ There is an upstream typing defect here worth knowing:
[angular#70125](https://github.com/angular/angular/issues/70125). Because
`provideWebMcpTools` has **one** type parameter for the whole array, tools
with *different* schemas collapse into a union and stop type-checking. The cast-free
fix is one call per tool:

```ts
providers: [
  provideWebMcpTools([getBoardTool]),
  provideWebMcpTools([makeMoveTool]),   // each array stays homogeneous
  provideWebMcpTools([resetGameTool]),
]
```

## Writing a good tool

The mechanics are easy. These are the judgement calls.

**Keep the tool thin.** A tool should be a wrapper over something that already
exists. If your `execute` contains business logic, that logic is now unavailable to
the rest of your app.

```ts
// good — the store is the single source of truth, buttons use it too
execute: ({sku, qty}) => inject(CartService).add(sku, qty)
```

**Write the description for a reader who cannot see your UI.** The agent chooses
between tools using only `name` and `description`. "Squares are numbered 0–8, left to
right, top to bottom" is the difference between a working tool and a confused one.

**Read before you write.** Give agents a cheap read-only tool (`get_board`,
`list_notes`) so they can orient themselves instead of guessing. They will use it.

**Return failures as text.** Covered in [chapter 1](./01-what-webmcp-is.md), and it
is the single highest-leverage habit:

```ts
return error
  ? `Move rejected. ${error}`
  : `Played ${player} on square ${square}.\n${store.describe()}`;
```

Note the successful branch returns the *new state* too. That saves the agent a
follow-up `get_board` call, which is a round trip and real money.

---

next: [Scope and navigation →](./04-scope-and-navigation.md)
