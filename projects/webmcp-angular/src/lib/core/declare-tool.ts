import {
  DestroyRef,
  Injector,
  assertInInjectionContext,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  runInInjectionContext,
  type EnvironmentProviders,
} from '@angular/core';

import {resolveModelContext} from '../adapter/model-context-adapter';
import type {JsonSchemaForInference, WebMcpToolDescriptor} from './tool-types';

/**
 * Declares a WebMCP tool.
 *
 * The tool is immediately registered and automatically unregistered when
 * the associated injection context is destroyed.
 *
 * The `tool.execute` function is invoked in the injection context of the provided
 * {@link Injector}, or the injection context of `declareWebMcpTool` itself.
 *
 * @param tool The tool to register and execute when invoked by an AI agent.
 * @param injector Optional {@link Injector} which will automatically unregister the
 *     tool when destroyed. Defaults to the current injection context if not provided.
 * @throws NG0203 when called outside an injection context and with no `injector`
 *     argument provided.
 * @experimental
 *
 * MIRRORS: `@angular/core` v22 `declareWebMcpTool`, line for line.
 */
export async function declareWebMcpTool<
  const InputSchema extends JsonSchemaForInference,
>(tool: WebMcpToolDescriptor<InputSchema>, injector?: Injector): Promise<void> {
  // v22 guards with the `ngServerMode` build global. That global is not reliably
  // present pre-v22, so the equivalent check is the absence of a document. Same
  // effect: never touch the browser API while prerendering.
  if (typeof document === 'undefined') {
    return;
  }

  const {modelContext} = resolveModelContext();
  if (!modelContext || typeof modelContext.registerTool !== 'function') {
    return;
  }

  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    if (!injector) {
      assertInInjectionContext(declareWebMcpTool);
    }
  }

  const currentInjector = injector ?? inject(Injector);
  const destroyRef = currentInjector.get(DestroyRef);
  const abortCtrl = new AbortController();

  const wrappedTool = {
    ...tool,
    execute: (args: never, client?: {signal?: AbortSignal}) => {
      // Compose Angular teardown with the agent's own cancellation, so either can
      // abort the call.
      const signal = client?.signal
        ? AbortSignal.any([abortCtrl.signal, client.signal])
        : abortCtrl.signal;
      return runInInjectionContext(currentInjector, () =>
        tool.execute(args, {...client, signal}),
      );
    },
  };

  // The spec has no `unregisterTool` — aborting this signal IS unregistration.
  destroyRef.onDestroy(() => void abortCtrl.abort());

  await modelContext.registerTool(wrappedTool as never, {signal: abortCtrl.signal});
}

/**
 * Provides a list of WebMCP tools tied to the lifecycle of the associated `Injector`.
 *
 * The tools are automatically registered when the environment is initialized and
 * unregistered when the associated injector is destroyed.
 *
 * The `tools[number].execute` function is invoked in the injection context of the
 * associated `Injector`.
 *
 * @param tools The tools to register and execute when invoked by an AI agent.
 * @returns An {@link EnvironmentProviders} for `bootstrapApplication` or route providers.
 * @experimental
 *
 * MIRRORS: `@angular/core` v22 `provideWebMcpTools`, including the
 * un-awaited call below — a duplicate tool name surfaces as an unhandled promise
 * rejection, exactly as it does upstream. See `docs/M0-FINDINGS.md` §2.4.
 */
export function provideWebMcpTools<
  const InputSchema extends JsonSchemaForInference,
>(tools: WebMcpToolDescriptor<InputSchema>[]): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => {
      for (const tool of tools) {
        declareWebMcpTool(tool);
      }
    }),
  ]);
}
