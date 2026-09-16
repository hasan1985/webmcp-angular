[← migrating](./06-migrating-to-angular-22.md) · [contents](./README.md)

# API reference

Every export, by entry point. The **✓** column marks exports with an `@angular/core`
v22 counterpart, so you can see at a glance what a switch to the native API would and
wouldn't touch.

---

## `webmcp-angular` — core

Mirrors `@angular/core` v22: same parameters, types and behaviour. Angular prefixes
its two functions with `Experimental`; this package doesn't.

| Export | ✓ | |
|---|---|---|
| `declareWebMcpTool` | ✓ | function |
| `provideWebMcpTools` | ✓ | function |
| `WebMcpToolDescriptor` | ✓ | type |
| `WebMcpToolExecute` | ✓ | type |
| `WebMcpClient` | ✓ | type |
| `JsonSchemaForInference` | ✓ | type, re-exported from `@mcp-b/webmcp-types` |
| `resolveModelContext` | ✗ | ours |
| `isWebMcpSupported` | ✗ | ours |
| `normalizeInputSchema` | ✗ | ours |
| `displayTitle` | ✗ | ours |
| `ModelContextSource`, `ResolvedModelContext` | ✗ | ours, types |

### `declareWebMcpTool(tool, injector?)`

```ts
function declareWebMcpTool<const InputSchema extends JsonSchemaForInference>(
  tool: WebMcpToolDescriptor<InputSchema>,
  injector?: Injector,
): Promise<void>
```

Registers immediately; unregisters when the injection context — or the `injector` you
pass — is destroyed. Throws `NG0203` if called outside an injection context with no
`injector`.

Rejects with `InvalidStateError` if the name is already registered.

### `provideWebMcpTools(tools)`

```ts
function provideWebMcpTools<const InputSchema extends JsonSchemaForInference>(
  tools: WebMcpToolDescriptor<InputSchema>[],
): EnvironmentProviders
```

Registers when the environment injector initializes; unregisters when it is destroyed.

**Does not await its registrations**, so a duplicate name surfaces as an unhandled
promise rejection rather than a throw — bootstrap succeeds and the tool is absent.
Matches v22 exactly.

One type parameter covers the whole array; see
[the typing wart](./02-writing-tools.md#the-one-typing-wart).

### `WebMcpToolDescriptor<InputSchema>`

```ts
interface WebMcpToolDescriptor<InputSchema extends JsonSchemaForInference> {
  name: string;          // unique per document, [A-Za-z0-9_.-], 1–128 chars
  description: string;
  inputSchema: InputSchema;
  execute: WebMcpToolExecute<InputSchema>;
}
```

Exactly four members. No `title`, no `annotations`, no `exposedTo` — Angular exposes
none of the spec's annotation hints.

### `WebMcpToolExecute<InputSchema>` and `WebMcpClient`

```ts
type WebMcpToolExecute<InputSchema extends JsonSchemaForInference> = (
  args: InferArgsFromInputSchema<InputSchema>,
  client: WebMcpClient,
) => unknown;

interface WebMcpClient {
  signal: AbortSignal;   // fires on agent cancellation OR injector destruction
}
```

Returns `unknown` — not a `{ content: [...] }` envelope. There is no
`WebMcpToolResult` type.

### Environment helpers *(not in v22)*

```ts
function resolveModelContext(): ResolvedModelContext;
function isWebMcpSupported(): boolean;
function normalizeInputSchema(schema: unknown): Record<string, unknown> | null;
function displayTitle(tool: { name: string; title?: string }): string;

type ModelContextSource = 'document' | 'navigator' | 'none';
interface ResolvedModelContext { source: ModelContextSource; modelContext: ModelContext | null }
```

`normalizeInputSchema` handles both generations of `getTools()` output —
`inputSchema` is a JSON **string** on Chrome 149–153 and an **object** from
154.0.8013 onward. `displayTitle` exists because the spec defaults `title` to `''`
rather than omitting it, so `??` doesn't fall through.

---

## `webmcp-angular/strict`

```ts
const webMcpTool: <const InputSchema extends JsonSchemaForInference>(
  tool: WebMcpToolDescriptor<InputSchema>,
) => WebMcpToolDescriptor<InputSchema>
```

Identity function. Pins each tool's schema to its own type parameter so `execute`
gets real argument types. Runtime no-op. Does **not** fix the provider call.

---

## `webmcp-angular/polyfill`

```ts
function installWebMcpPolyfill(options?: InstallWebMcpPolyfillOptions): Promise<WebMcpBacking>

type WebMcpBacking = 'native' | 'polyfill' | 'server' | 'unavailable';
interface InstallWebMcpPolyfillOptions { installTestingShim?: boolean }
```

Call **before** `bootstrapApplication` — see
[getting started](./01-getting-started.md#2-install-the-polyfill).

| Result | |
|---|---|
| `'native'` | the browser already had it; nothing was installed |
| `'polyfill'` | installed by `@mcp-b/webmcp-polyfill` |
| `'server'` | server render; nothing installed, nothing needed |
| `'unavailable'` | the optional peer isn't installed, so tools can't register |

Never throws. `@mcp-b/webmcp-polyfill` is an optional peer dependency you install
yourself.

---

## `webmcp-angular/testing`

```ts
function installWebMcpTestHarness(): WebMcpHarness
```

See [chapter 4](./04-testing.md) for the full member table. Needs a DOM.

---

## `webmcp-angular/devtools`

```ts
function mountWebMcpDevtools(options?: WebMcpDevtoolsOptions): WebMcpDevtools

type WebMcpDevtoolsPosition =
  | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'inline';
```

Load it with a **dynamic** import behind `isDevMode()` — see
[chapter 5](./05-inspecting-and-connecting.md#keep-it-out-of-your-bundle).

---

## `webmcp-angular/bridge`

```ts
function createWebMcpBridge(options: WebMcpBridgeOptions): WebMcpBridge

const DEFAULT_CHANNEL_ID = 'mcp-default';
const PROTOCOL_VERSION = '2025-11-25';
```

`allowedOrigins` is required. See
[chapter 5](./05-inspecting-and-connecting.md#the-bridge).

---

## Schematics

```bash
ng generate webmcp-angular:migrate [--dry-run] [--path=<dir>]
```

See [chapter 6](./06-migrating-to-angular-22.md).

---

## Peer dependencies

| Package | Range | |
|---|---|---|
| `@angular/core` | `>=20 <24` | required |
| `@angular/common` | `>=20 <24` | required |
| `@angular/router` | `>=20 <24` | optional |
| `@mcp-b/webmcp-polyfill` | `*` | optional |
