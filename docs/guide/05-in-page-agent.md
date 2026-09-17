[← testing](./04-testing.md) · [contents](./README.md) · next: [External agents →](./06-external-agents.md)

# 5. The in-page agent

**Your app is the agent.** It reads the page's tools from `document.modelContext`,
sends them to an LLM through an API call it makes itself — streaming or not — runs
whatever the model asks for, and shows the answer. Nothing leaves the page except
that API call. This is the playground's chat panel, and for most apps it is the
main use case.

The other case — an agent that lives *outside* the page and reaches in — is the
[next chapter](./06-external-agents.md). You can build either, both, or neither; this
one needs nothing but the core and the polyfill.

## What you need

| Entry point | | Why |
|---|---|---|
| `webmcp-angular` | required | tools appear and disappear with the injector that owns them ([chapter 3](./03-scoping-tools.md)) |
| `webmcp-angular/polyfill` | required | your users' browsers have no `document.modelContext`; the polyfill is it, and it supplies `executeTool` so your chat can run tools |
| `webmcp-angular/strict` · `/testing` · `/devtools` | optional | authoring types, unit tests, an inspector while developing |
| `webmcp-angular/bridge` | **not needed** | only for agents outside the page |

## Why the registry, and not just an array of tools

You could hand the model a hard-coded list. What `document.modelContext` gives you
instead:

- **Scope for free.** A tool declared in a routed component exists while that page
  is open. Read the live list each turn and the model sees only what applies *here,
  now* — fewer tokens, fewer wrong choices, no lifecycle code of your own.
- **One-to-one with the `tools` parameter.** `name` / `description` / `inputSchema`
  map straight onto the Messages API. The adapter below is a ten-line `map`.
- **Your chat imports nothing from your features.** It learns tools through
  `getTools()` and runs them through `executeTool()`. New feature, new tools, chat
  untouched. The playground states this as [its one rule](../../../webmcp-angular-playground/README.md#the-one-rule).
- **The other agents stay an option at zero cost.** Same tools, same code; if the
  browser's agent or an extension ever matters, it is a switch, not a rewrite.

## The three pieces

### 1. Discover — `getTools()` → the API's `tools` shape

```ts
import type Anthropic from '@anthropic-ai/sdk';

export async function discoverTools(): Promise<Anthropic.Tool[]> {
  const ctx = document.modelContext;
  if (!ctx) return [];
  return (await ctx.getTools()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: normalizeSchema(tool.inputSchema),   // string on Chrome 149–153, object after
  }));
}

function normalizeSchema(schema: unknown): Anthropic.Tool.InputSchema {
  let value = schema;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  return value && typeof value === 'object'
    ? (value as Anthropic.Tool.InputSchema)
    : {type: 'object', properties: {}};
}
```

### 2. Run — `executeTool()`, failures as text

```ts
export async function runTool(name: string, input: unknown): Promise<{text: string; isError: boolean}> {
  const ctx = document.modelContext as (ModelContext & {executeTool?: Function}) | undefined;
  if (!ctx) return {text: 'WebMCP is not available in this browser.', isError: true};

  const tool = (await ctx.getTools()).find((t) => t.name === name);   // must be one you got out
  if (!tool) return {text: `No tool named "${name}" is currently registered.`, isError: true};
  if (typeof ctx.executeTool !== 'function') {
    return {text: 'This browser can list tools but not run them (no executeTool).', isError: true};
  }
  try {
    const result = await ctx.executeTool(tool, JSON.stringify(input ?? {}));   // JSON string today
    return {text: result ?? '(the tool returned nothing)', isError: false};
  } catch (error) {
    return {text: `Tool "${name}" failed: ${(error as Error).message}`, isError: true};
  }
}
```

Two things worth knowing about that call. `executeTool` takes the `RegisteredTool`
object you got from `getTools()`, so find it by name first. And it takes the
arguments as a **JSON string** today — the draft has moved to an object, but every
runnable implementation still wants the string; `JSON.stringify` in this one place is
the whole adaptation ([architecture chapter 1](../architecture/01-what-webmcp-is.md#the-page-can-call-its-own-tools)).

### 3. The loop — once per user turn

```ts
export async function runTurn(client: Anthropic, messages: MessageParam[], onText: (t: string) => void) {
  const tools = await discoverTools();           // live list, read once per turn

  for (let round = 0; round < 10; round++) {     // bounded, so a confused model cannot loop forever
    const stream = client.messages.stream({model: 'claude-opus-5', max_tokens: 16000, system, tools, messages});
    stream.on('text', onText);                   // tokens as they arrive
    const response = await stream.finalMessage();

    messages.push({role: 'assistant', content: response.content});
    if (response.stop_reason !== 'tool_use') return messages;

    const results: ToolResultBlockParam[] = [];
    for (const use of response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')) {
      const {text, isError} = await runTool(use.name, use.input);
      results.push({type: 'tool_result', tool_use_id: use.id, content: text, is_error: isError});
    }
    messages.push({role: 'user', content: results});   // ALL results in ONE user message
  }
  return messages;
}
```

Text streams; tool calls arrive complete at the end of a stream; you run them and
stream again. Return every tool result in one user message — splitting them teaches
the model to stop making parallel calls.

**Once per turn, not once at startup.** The user may have navigated since their last
message. And not again *between* the tool calls within a turn — the list cannot
change mid-turn, so that would be waste.

## What else goes in the request

**A system prompt that says what the tools are.** Something like: *the page exposes
its capabilities as tools; the list changes as the user navigates, so rely on the
list you are given each turn; read state before changing it; a rejected call
explains why — correct the next call rather than repeating it.*

**App-wide context, read once per session.** Every `description` is per tool;
nothing says what the app *is*. Publish that as a cheap read-only tool
(`about_this_app`), call it once when a chat starts, and fold the text into the
system prompt ([chapter 2](./02-writing-tools.md#write-descriptions-for-someone-who-cant-see-your-ui);
the playground's `app-context.tool.ts` is the worked example).

**A way to switch tools off.** If your chat has a plain mode, omit the `tools` key
entirely — not an empty array — *and* swap to a prompt that does not mention tools,
or the model narrates calls it never made. Switching starts a new session, so a
transcript with tool blocks is never replayed without a `tools` key. Registration is
untouched either way; the switch governs what you *send*
([architecture chapter 7 · cadence](../architecture/07-lifecycle-in-page-agent.md#cadence-when-you-control-the-agent)).

## The key

The playground calls the API from the browser with `dangerouslyAllowBrowser: true`
and a key the user pastes at runtime. That is fine for a demo and **wrong for a
product**: ship a backend that holds the key and forwards the request. The loop above
does not change — only where `client` points.

## Where to look

In the playground: `src/app/chat/webmcp-bridge.ts` (discover and run — the one file
that touches `document.modelContext`), `src/app/chat/agent.ts` (the loop and the
prompts), `src/app/chat/chat.ts` (sessions, the toggle, the key), and
`src/app/agent-turn.ts` (how a page hands the agent a turn without importing the
chat).

---

next: [External agents →](./06-external-agents.md)
