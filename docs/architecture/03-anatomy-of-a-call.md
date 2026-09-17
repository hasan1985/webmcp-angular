[← the lifecycle](./02-the-lifecycle.md) · [contents](./README.md) · next: [Scope and navigation →](./04-scope-and-navigation.md)

# 3. Anatomy of a tool call

Registration is half the story. Here is the other half: what actually happens between
an agent deciding to call something and your service running.

## The round trip, in-page agent

Your chat panel is the harness. It handed the model the tool list, the model
answered with a name and arguments, and now the panel makes the call:

```
  ┌───────────────────┐
  │  YOUR CHAT PANEL  │  model replied: call add_to_cart({sku: "A1", qty: 2})
  └────────┬──────────┘
           │  executeTool(tool, '{"sku":"A1","qty":2}')
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
  ┌───────────────────┐
  │  YOUR CHAT PANEL  │  puts "Added 2 × A1." in a tool_result and sends it to the model
  └───────────────────┘
```

Nothing in that path touches the DOM, and the UI updates because your *service*
changed — the same service the buttons use. The model made the decision at the top
from a tool list it was handed, and reads the text at the bottom; the panel is the
only thing that calls
([chapter 7, diagram 2](./07-lifecycle-in-page-agent.md#2-a-user-asks-the-agent-to-do-something)).

## The round trip, external agent

The harness is an MCP client outside the page. Its call arrives as JSON-RPC and the
bridge makes the `executeTool` call on its behalf:

```
  ┌────────────────────────────┐
  │  MCP CLIENT                │  model replied: call add_to_cart({sku: "A1", qty: 2})
  │  (Claude Desktop, Cursor)  │
  └────────────┬───────────────┘
               │  tools/call {name: "add_to_cart", arguments: {…}}     JSON-RPC
               ▼
  ┌────────────────────────────┐
  │  RELAY                     │  extension content script — isolated world,
  │                            │  cannot touch document.modelContext
  └────────────┬───────────────┘
               │  postMessage envelope                                  same window
               ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  BRIDGE    webmcp-angular/bridge                                 │
  │            checks origin and source, finds the tool by name      │
  └────┬─────────────────────────────────────────────────────────────┘
       │  executeTool(tool, '{"sku":"A1","qty":2}')
       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  BROWSER → ANGULAR'S WRAPPER → YOUR TOOL → BROWSER               │
  │                                                                  │
  │  identical to the in-page path above, step for step              │
  └────┬─────────────────────────────────────────────────────────────┘
       │  "Added 2 × A1."
       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  BRIDGE    wraps it: {content: [{type: "text", text}], isError}  │
  └────────────┬─────────────────────────────────────────────────────┘
               │  postMessage envelope → relay → JSON-RPC response
               ▼
  ┌────────────────────────────┐
  │  MCP CLIENT                │  puts the text in a tool_result and sends it to the model
  └────────────────────────────┘
```

Two hops on the way in and two on the way out; the box in the middle is the same
code. A rejected call comes back as a *successful* JSON-RPC response with
`isError: true`, so the model reads the reason exactly as an in-page model would
([chapter 5](./05-transports.md#one-mcp-convention-worth-copying)). The full
session around this call — how the relay got there, `initialize`, `tools/list` — is
[chapter 8](./08-lifecycle-external-agent.md).

From `document.modelContext` down, the two agents are indistinguishable. Everything
in the rest of this chapter applies to both.

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

**Put app-wide context in a tool of its own.** `description` is per tool, and the
draft has no equivalent of MCP's server-level `instructions`. What is true of the app
as a whole — which pages exist, which tools come and go with them, the conventions
every tool shares — fits nowhere in the list, so publish it as a cheap read-only tool
whose description says to read it first:

```ts
{
  name: 'about_this_app',
  description: 'Read this before using the other tools: what this app is, and the conventions its tools share.',
  inputSchema: {type: 'object', properties: {}},
  execute: () => APP_CONTEXT,   // a few hundred characters of plain text
}
```

Only the one-line description rides in `getTools()` on every turn; the body travels
once, when an agent reads it. Because it is an ordinary tool, every consumer gets it —
the browser's agent, an in-page chat, an MCP client through the bridge — with no extra
plumbing. The playground's `about_this_app` is the worked example.

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
