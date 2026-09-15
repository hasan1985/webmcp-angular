/*
 * webmcp-angular/strict
 *
 * NON-MIGRATING entry point: Angular v22 has no equivalent. Anything imported
 * from here must be removed or replaced by hand when migrating to @angular/core.
 */

import type {JsonSchemaForInference, WebMcpToolDescriptor} from 'webmcp-angular';

/**
 * An identity function that pins each tool's schema to its own type parameter.
 *
 * Partially mitigates https://github.com/angular/angular/issues/70125. Wrapping a
 * descriptor infers its schema on its own, so `execute` gets correctly-typed
 * arguments as you write it instead of a union of every tool's schema.
 *
 * ```ts
 * export const addToCart = webMcpTool({
 *   name: 'add_to_cart',
 *   description: '…',
 *   inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
 *   execute: ({sku}) => …,   // sku: string, not a union
 * });
 * ```
 *
 * **It does not fix the provider call.** `provideExperimentalWebMcpTools` takes one
 * type parameter for the whole array, so tools with *different* input schemas still
 * have no valid `S` and the call will not compile. The fix there is one call per
 * tool, which keeps each array homogeneous and needs no cast:
 *
 * ```ts
 * provideExperimentalWebMcpTools([addToCart]),
 * provideExperimentalWebMcpTools([removeFromCart]),
 * ```
 *
 * The alternative — `as unknown as WebMcpToolDescriptor<never>[]` — compiles but
 * discards the typing that made writing a schema worthwhile.
 *
 * Purely a type-level helper: it returns its argument unchanged and costs nothing
 * at runtime. If angular#70125 is fixed upstream, delete the wrappers; nothing
 * else changes.
 */
export const webMcpTool = <const InputSchema extends JsonSchemaForInference>(
  tool: WebMcpToolDescriptor<InputSchema>,
): WebMcpToolDescriptor<InputSchema> => tool;
