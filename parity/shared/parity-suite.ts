import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
  InjectionToken,
  Injector,
  createEnvironmentInjector,
  inject,
  type EnvironmentInjector,
  type EnvironmentProviders,
} from '@angular/core';

import {FakeModelContext, installFakeModelContext} from './fake-model-context';

/**
 * The surface under test. Both `ng-webmcp-compat` and `@angular/core` v22 must
 * satisfy this — if either stops matching, it will not type-check here.
 */
export interface WebMcpImpl {
  declareExperimentalWebMcpTool: (tool: any, injector?: Injector) => Promise<void>;
  provideExperimentalWebMcpTools: (tools: any[]) => EnvironmentProviders;
}

// Deliberately NOT `providedIn: 'root'` — a bare `Injector.create()` is not a
// root-scoped injector, so a root-provided token would fail to resolve in both
// implementations and mask a real divergence.
const GREETING = new InjectionToken<string>('GREETING');

const EMPTY_SCHEMA = {type: 'object', properties: {}} as const;

/**
 * One spec, run against every implementation. This is the release gate: if the
 * two runs diverge, the compatibility claim is false.
 */
export function runParitySuite(label: string, impl: WebMcpImpl): void {
  const {declareExperimentalWebMcpTool, provideExperimentalWebMcpTools} = impl;

  describe(`WebMCP parity — ${label}`, () => {
    let fake: FakeModelContext;
    let uninstall: () => void;
    let root: EnvironmentInjector;

    beforeEach(() => {
      ({fake, uninstall} = installFakeModelContext());
      root = Injector.create({
        providers: [{provide: GREETING, useValue: 'hello from DI'}],
      }) as EnvironmentInjector;
    });

    afterEach(() => {
      uninstall();
    });

    describe('declareExperimentalWebMcpTool', () => {
      it('registers the tool with its name, description and schema', async () => {
        await declareExperimentalWebMcpTool(
          {
            name: 'greet',
            description: 'Greets the agent.',
            inputSchema: EMPTY_SCHEMA,
            execute: () => 'hi',
          },
          root,
        );

        const tools = await fake.getTools();
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('greet');
        expect(tools[0].description).toBe('Greets the agent.');
        expect(tools[0].inputSchema).toEqual(EMPTY_SCHEMA);
      });

      it('passes the agent arguments through to execute', async () => {
        let seen: unknown;
        await declareExperimentalWebMcpTool(
          {
            name: 'echo',
            description: 'Echoes input.',
            inputSchema: {
              type: 'object',
              properties: {value: {type: 'string'}},
              required: ['value'],
            },
            execute: (args: {value: string}) => {
              seen = args;
              return args.value;
            },
          },
          root,
        );

        const result = await fake.executeTool('echo', {value: 'abc'});
        expect(seen).toEqual({value: 'abc'});
        expect(result).toBe('abc');
      });

      it('runs execute inside the injection context, so inject() works', async () => {
        await declareExperimentalWebMcpTool(
          {
            name: 'from-di',
            description: 'Reads a token from DI.',
            inputSchema: EMPTY_SCHEMA,
            execute: () => inject(GREETING),
          },
          root,
        );

        expect(await fake.executeTool('from-di', {})).toBe('hello from DI');
      });

      it('returns whatever execute returns, unwrapped', async () => {
        await declareExperimentalWebMcpTool(
          {
            name: 'structured',
            description: 'Returns an object.',
            inputSchema: EMPTY_SCHEMA,
            execute: () => ({ok: true, count: 2}),
          },
          root,
        );

        expect(await fake.executeTool('structured', {})).toEqual({ok: true, count: 2});
      });

      it('unregisters the tool when the injector is destroyed', async () => {
        const child = createEnvironmentInjector([], root);
        await declareExperimentalWebMcpTool(
          {
            name: 'scoped',
            description: 'Scoped to a child injector.',
            inputSchema: EMPTY_SCHEMA,
            execute: () => 'ok',
          },
          child,
        );

        expect(fake.has('scoped')).toBe(true);
        child.destroy();
        expect(fake.has('scoped')).toBe(false);
      });

      it('passes an AbortSignal to execute that fires when the injector is destroyed', async () => {
        const child = createEnvironmentInjector([], root);
        let captured: AbortSignal | undefined;

        await declareExperimentalWebMcpTool(
          {
            name: 'cancellable',
            description: 'Captures its abort signal.',
            inputSchema: EMPTY_SCHEMA,
            execute: (_args: unknown, client: {signal: AbortSignal}) => {
              captured = client.signal;
              return 'ok';
            },
          },
          child,
        );

        await fake.executeTool('cancellable', {});
        expect(captured).toBeInstanceOf(AbortSignal);
        expect(captured!.aborted).toBe(false);

        child.destroy();
        expect(captured!.aborted).toBe(true);
      });

      it("composes the agent's own abort signal with the injector's", async () => {
        let captured: AbortSignal | undefined;
        await declareExperimentalWebMcpTool(
          {
            name: 'agent-cancel',
            description: 'Captures its abort signal.',
            inputSchema: EMPTY_SCHEMA,
            execute: (_args: unknown, client: {signal: AbortSignal}) => {
              captured = client.signal;
              return 'ok';
            },
          },
          root,
        );

        const agent = new AbortController();
        await fake.executeTool('agent-cancel', {}, agent.signal);
        expect(captured!.aborted).toBe(false);

        // The agent aborting must cancel the call, without the injector dying.
        agent.abort();
        expect(captured!.aborted).toBe(true);
      });

      it('rejects when a tool name is already registered', async () => {
        const tool = {
          name: 'dupe',
          description: 'First registration.',
          inputSchema: EMPTY_SCHEMA,
          execute: () => 'ok',
        };
        await declareExperimentalWebMcpTool(tool, root);

        let error: unknown;
        try {
          await declareExperimentalWebMcpTool({...tool}, root);
        } catch (e) {
          error = e;
        }
        expect((error as DOMException | undefined)?.name).toBe('InvalidStateError');
      });

      it('is a silent no-op when the browser has no WebMCP support', async () => {
        uninstall();
        await expect(
          declareExperimentalWebMcpTool(
            {
              name: 'unsupported',
              description: 'Should never register.',
              inputSchema: EMPTY_SCHEMA,
              execute: () => 'ok',
            },
            root,
          ),
        ).resolves.toBeUndefined();
      });
    });

    describe('provideExperimentalWebMcpTools', () => {
      it('registers every tool when the environment injector is created', async () => {
        createEnvironmentInjector(
          [
            provideExperimentalWebMcpTools([
              {
                name: 'a',
                description: 'Tool A.',
                inputSchema: EMPTY_SCHEMA,
                execute: () => 'a',
              },
              {
                name: 'b',
                description: 'Tool B.',
                inputSchema: EMPTY_SCHEMA,
                execute: () => 'b',
              },
            ]),
          ],
          root,
        );

        await Promise.resolve();
        expect(fake.size).toBe(2);
        expect(fake.has('a')).toBe(true);
        expect(fake.has('b')).toBe(true);
      });

      it('unregisters every tool when that injector is destroyed', async () => {
        const child = createEnvironmentInjector(
          [
            provideExperimentalWebMcpTools([
              {
                name: 'scoped-a',
                description: 'Tool A.',
                inputSchema: EMPTY_SCHEMA,
                execute: () => 'a',
              },
            ]),
          ],
          root,
        );

        await Promise.resolve();
        expect(fake.has('scoped-a')).toBe(true);

        child.destroy();
        expect(fake.has('scoped-a')).toBe(false);
      });

      it('resolves tool execution through the providing injector', async () => {
        const child = createEnvironmentInjector(
          [
            {provide: GREETING, useValue: 'scoped greeting'},
            provideExperimentalWebMcpTools([
              {
                name: 'scoped-di',
                description: 'Reads a scoped token.',
                inputSchema: EMPTY_SCHEMA,
                execute: () => inject(GREETING),
              },
            ]),
          ],
          root,
        );

        await Promise.resolve();
        expect(await fake.executeTool('scoped-di', {})).toBe('scoped greeting');
        child.destroy();
      });
    });
  });
}
