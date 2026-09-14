import type {InferArgsFromInputSchema, JsonSchemaForInference} from '@mcp-b/webmcp-types';

// Re-exported so consumers constrain their schemas exactly as Angular v22 does.
// Angular vendors this same type under `third_party/@mcp-b/webmcp-types`.
export type {JsonSchemaForInference};

/**
 * The result an agent receives back from a tool.
 *
 * MIRRORS: `@angular/core` v22 `WebMcpToolResult`.
 */
export interface WebMcpToolResult {
  content: Array<{type: string; text: string}>;
}

/**
 * The callback which implements a tool. Invoked inside the injection context of
 * the owning `Injector`, so `inject()` is usable in the body.
 *
 * MIRRORS: `@angular/core` v22 `WebMcpToolExecute`.
 */
export type WebMcpToolExecute<InputSchema extends JsonSchemaForInference> = (
  args: InferArgsFromInputSchema<InputSchema>,
) => WebMcpToolResult | Promise<WebMcpToolResult>;

/**
 * Describes a tool exposed to AI agents.
 *
 * MIRRORS: `@angular/core` v22 `WebMcpToolDescriptor`.
 *
 * Deliberately NOT `ToolDescriptor` from `@mcp-b/webmcp-types` — that one is
 * generic over the *args*, this is generic over the *schema*. See
 * `docs/M0-FINDINGS.md` §1.2.
 */
export interface WebMcpToolDescriptor<InputSchema extends JsonSchemaForInference> {
  /** The unique name of this tool. */
  name: string;
  /** What the tool does and how the agent should consider using it. */
  description: string;
  /** Schema of the input arguments the agent must provide to `execute`. */
  inputSchema: InputSchema;
  /** The callback function which implements this tool. */
  execute: WebMcpToolExecute<InputSchema>;
}
