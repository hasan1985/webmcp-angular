import type {InferArgsFromInputSchema, JsonSchemaForInference} from '@mcp-b/webmcp-types';

// Re-exported so consumers constrain their schemas exactly as Angular v22 does.
// Angular vendors this same package under `third_party/@mcp-b/webmcp-types`.
export type {JsonSchemaForInference};

/**
 * The client context of a given WebMCP tool execution.
 *
 * MIRRORS: `@angular/core` v22 `WebMcpClient` (internally `Client`).
 */
export interface WebMcpClient {
  /**
   * A signal which notifies the tool when the operation is aborted. When triggered, the
   * current operation should be canceled and all allocated resources should be cleaned up.
   */
  signal: AbortSignal;
}

/**
 * The execute function of a WebMCP tool. Takes in arguments matching the associated
 * `inputSchema` and returns content for the agent. The returned result is typically a
 * `string`.
 *
 * MIRRORS: `@angular/core` v22 `WebMcpToolExecute` (internally `Execute`).
 *
 * Note the return type is `unknown`, not a structured `{content: [...]}` envelope —
 * Angular serializes whatever you return. See `docs/decisions/evidence.md` 1.1.
 */
export type WebMcpToolExecute<InputSchema extends JsonSchemaForInference> = (
  args: InferArgsFromInputSchema<InputSchema>,
  client: WebMcpClient,
) => unknown;

/**
 * Describes and implements a specific WebMCP tool for an agent to invoke.
 *
 * MIRRORS: `@angular/core` v22 `WebMcpToolDescriptor` (internally `ToolDescriptor`).
 *
 * Deliberately NOT `ToolDescriptor` from `@mcp-b/webmcp-types` — that one is generic
 * over the *args*, this is generic over the *schema*. See `docs/decisions/evidence.md` 1.6.
 *
 * There is no `title` and no `annotations` here: Angular exposes neither, so neither
 * does this package.
 */
export interface WebMcpToolDescriptor<InputSchema extends JsonSchemaForInference> {
  /** The unique name of this tool. */
  name: string;
  /** A description of what the tool does and how the agent should consider using it. */
  description: string;
  /**
   * A schema which describes the input arguments expected by the `execute` function
   * which the agent must provide.
   */
  inputSchema: InputSchema;
  /** The callback function which implements this tool. */
  execute: WebMcpToolExecute<InputSchema>;
}
