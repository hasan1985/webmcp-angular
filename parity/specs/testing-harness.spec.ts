import {describe, it, expect, afterEach} from 'vitest';
import {Injector, createEnvironmentInjector, type EnvironmentInjector} from '@angular/core';

import {installWebMcpTestHarness} from '../../dist/webmcp-angular/fesm2022/webmcp-angular-testing.mjs';
import {
  declareExperimentalWebMcpTool,
  provideExperimentalWebMcpTools,
} from '../../dist/webmcp-angular/fesm2022/webmcp-angular.mjs';

/**
 * M7 — the test harness.
 *
 * The harness is only worth shipping if a consumer's tests, written against it,
 * would also pass in a browser. So these tests drive the harness through the real
 * library rather than poking at it directly.
 */
describe('installWebMcpTestHarness', () => {
  let harness: ReturnType<typeof installWebMcpTestHarness> | undefined;
  let root: EnvironmentInjector;

  const setup = () => {
    harness = installWebMcpTestHarness();
    root = Injector.create({providers: []}) as EnvironmentInjector;
    return harness;
  };

  afterEach(() => {
    harness?.uninstall();
    harness = undefined;
  });

  const greet = {
    name: 'greet',
    description: 'Greets someone.',
    inputSchema: {
      type: 'object',
      properties: {who: {type: 'string'}},
      required: ['who'],
    },
    execute: ({who}: {who: string}) => `hello ${who}`,
  };

  it('observes tools registered through the real library', async () => {
    const webmcp = setup();
    await declareExperimentalWebMcpTool(greet, root);

    expect(webmcp.has('greet')).toBe(true);
    expect(webmcp.toolNames()).toEqual(['greet']);
    expect(webmcp.get('greet')?.description).toBe('Greets someone.');
  });

  it('invokes a tool the way an agent would', async () => {
    const webmcp = setup();
    await declareExperimentalWebMcpTool(greet, root);

    expect(await webmcp.invoke('greet', {who: 'world'})).toBe('hello world');
  });

  it('records calls, including the arguments and result', async () => {
    const webmcp = setup();
    await declareExperimentalWebMcpTool(greet, root);

    await webmcp.invoke('greet', {who: 'a'});
    await webmcp.invoke('greet', {who: 'b'});

    expect(webmcp.calls()).toEqual([
      {name: 'greet', args: {who: 'a'}, result: 'hello a'},
      {name: 'greet', args: {who: 'b'}, result: 'hello b'},
    ]);

    webmcp.clearCalls();
    expect(webmcp.calls()).toEqual([]);
  });

  it('fails with a useful message when a tool never registered', async () => {
    const webmcp = setup();
    await declareExperimentalWebMcpTool(greet, root);

    // The most common WebMCP bug is a tool that silently did not register, so the
    // error has to name what IS there.
    await expect(webmcp.invoke('typo_name')).rejects.toThrow(
      /No WebMCP tool named "typo_name".*Currently registered: greet/s,
    );
  });

  it('sees tools disappear when their injector is destroyed', async () => {
    const webmcp = setup();
    const child = createEnvironmentInjector([], root);
    await declareExperimentalWebMcpTool(greet, child);

    expect(webmcp.has('greet')).toBe(true);
    child.destroy();
    expect(webmcp.has('greet')).toBe(false);
  });

  it('works with the provider API too', async () => {
    const webmcp = setup();
    createEnvironmentInjector([provideExperimentalWebMcpTools([greet])], root);
    await Promise.resolve();

    expect(webmcp.has('greet')).toBe(true);
    expect(await webmcp.invoke('greet', {who: 'providers'})).toBe('hello providers');
  });

  it('rejects duplicate names, as a browser would', async () => {
    setup();
    await declareExperimentalWebMcpTool(greet, root);

    let error: unknown;
    try {
      await declareExperimentalWebMcpTool({...greet}, root);
    } catch (e) {
      error = e;
    }
    expect((error as DOMException | undefined)?.name).toBe('InvalidStateError');
  });

  it('fires toolchange on registration and unregistration', async () => {
    setup();
    let events = 0;
    document.modelContext!.addEventListener('toolchange', () => void events++);

    const child = createEnvironmentInjector([], root);
    await declareExperimentalWebMcpTool(greet, child);
    expect(events).toBe(1);

    child.destroy();
    expect(events).toBe(2);
  });

  it('propagates a throwing tool and records the error', async () => {
    const webmcp = setup();
    await declareExperimentalWebMcpTool(
      {
        name: 'boom',
        description: 'Always throws.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => {
          throw new Error('kaboom');
        },
      },
      root,
    );

    await expect(webmcp.invoke('boom')).rejects.toThrow('kaboom');
    expect((webmcp.calls()[0].error as Error).message).toBe('kaboom');
  });

  it('passes an abort signal through to execute', async () => {
    const webmcp = setup();
    let seen: AbortSignal | undefined;
    await declareExperimentalWebMcpTool(
      {
        name: 'cancellable',
        description: 'Captures its signal.',
        inputSchema: {type: 'object', properties: {}},
        execute: (_args: unknown, client: {signal: AbortSignal}) => {
          seen = client.signal;
          return 'ok';
        },
      },
      root,
    );

    const controller = new AbortController();
    await webmcp.invoke('cancellable', {}, {signal: controller.signal});
    expect(seen!.aborted).toBe(false);
    controller.abort();
    expect(seen!.aborted).toBe(true);
  });

  it('restores whatever was on document when uninstalled', async () => {
    const sentinel = {marker: true};
    Object.defineProperty(document, 'modelContext', {configurable: true, value: sentinel});

    const webmcp = installWebMcpTestHarness();
    expect(document.modelContext).not.toBe(sentinel);

    webmcp.uninstall();
    expect(document.modelContext).toBe(sentinel);

    delete (document as {modelContext?: unknown}).modelContext;
  });
});
