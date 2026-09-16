import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {Injector, createEnvironmentInjector, type EnvironmentInjector} from '@angular/core';

// Deliberately the BUILT ARTIFACT, not workspace source. The risk this file
// covers is a module-scope `document` touch that only ng-packagr's output would
// expose, so testing source here would test the wrong thing.
import {
  declareWebMcpTool,
  isWebMcpSupported,
  provideWebMcpTools,
  resolveModelContext,
} from '../../dist/webmcp-angular/fesm2022/webmcp-angular.mjs';

/**
 * M4 — server-side rendering.
 *
 * Runs under vitest's `node` environment, so there is no `document` and no
 * `navigator`. That is what a server render or a build-time prerender looks like.
 *
 * The whole contract is: **do nothing, silently, and never throw.** A
 * `ReferenceError: document is not defined` here does not just lose the tools, it
 * takes down the server render of the entire page.
 *
 * This is the branch the jsdom parity suite can never reach: `document` always
 * exists there, so the guard's true arm went untested until this file existed.
 */
describe('SSR / prerender (no document)', () => {
  let root: EnvironmentInjector;
  const consoleErrors: unknown[][] = [];
  let originalError: typeof console.error;

  beforeEach(() => {
    root = Injector.create({providers: []}) as EnvironmentInjector;
    consoleErrors.length = 0;
    originalError = console.error;
    console.error = (...args: unknown[]) => void consoleErrors.push(args);
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('confirms the environment really has no document', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it('reports WebMCP as unsupported instead of throwing', () => {
    expect(() => isWebMcpSupported()).not.toThrow();
    expect(isWebMcpSupported()).toBe(false);
  });

  it('resolves to no model context, with source "none"', () => {
    const resolved = resolveModelContext();
    expect(resolved.source).toBe('none');
    expect(resolved.modelContext).toBeNull();
  });

  it('declareWebMcpTool resolves quietly and registers nothing', async () => {
    await expect(
      declareWebMcpTool(
        {
          name: 'server_side',
          description: 'Must never register during a server render.',
          inputSchema: {type: 'object', properties: {}},
          execute: () => {
            throw new Error('execute must not run on the server');
          },
        },
        root,
      ),
    ).resolves.toBeUndefined();
  });

  it('provideWebMcpTools creates its injector without throwing', () => {
    expect(() =>
      createEnvironmentInjector(
        [
          provideWebMcpTools([
            {
              name: 'server_side_provided',
              description: 'Must never register during a server render.',
              inputSchema: {type: 'object', properties: {}},
              execute: () => {
                throw new Error('execute must not run on the server');
              },
            },
          ]),
        ],
        root,
      ),
    ).not.toThrow();
  });

  it('stays silent — no console noise during a server render', async () => {
    createEnvironmentInjector(
      [
        provideWebMcpTools([
          {
            name: 'quiet',
            description: 'Registration is skipped without comment.',
            inputSchema: {type: 'object', properties: {}},
            execute: () => 'never',
          },
        ]),
      ],
      root,
    );
    // Let any unawaited registration promise settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleErrors).toEqual([]);
  });

  it('does not leave an unhandled rejection behind', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => void rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    createEnvironmentInjector(
      [
        provideWebMcpTools([
          {
            name: 'dup',
            description: 'Registered twice — on a server this must still be inert.',
            inputSchema: {type: 'object', properties: {}},
            execute: () => 'never',
          },
          {
            name: 'dup',
            description: 'Duplicate name.',
            inputSchema: {type: 'object', properties: {}},
            execute: () => 'never',
          },
        ]),
      ],
      root,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
  });
});
