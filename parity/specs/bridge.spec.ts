import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {Injector, type EnvironmentInjector} from '@angular/core';

import {createWebMcpBridge} from '../../dist/webmcp-angular/fesm2022/webmcp-angular-bridge.mjs';
import {installWebMcpTestHarness} from '../../dist/webmcp-angular/fesm2022/webmcp-angular-testing.mjs';
import {declareWebMcpTool} from '../../dist/webmcp-angular/fesm2022/webmcp-angular.mjs';

/**
 * M8 — the JSON-RPC bridge.
 *
 * Driven by a hand-written client that speaks the same postMessage envelope as
 * `@mcp-b/transports`' `TabClientTransport`:
 *
 *   {channel, type: 'mcp', direction: 'client-to-server' | 'server-to-client', payload}
 *
 * Written by hand rather than importing the transport so the wire format is
 * asserted explicitly — if `@mcp-b` changes it, these tests fail and say so,
 * instead of both sides drifting together.
 */

const CHANNEL = 'mcp-default';

/** Minimal stand-in for TabClientTransport. */
class TestClient {
  private readonly received: unknown[] = [];
  private readonly handler = (event: MessageEvent) => {
    const data = event.data as {channel?: string; type?: string; direction?: string; payload?: unknown};
    if (data?.channel !== CHANNEL || data.type !== 'mcp' || data.direction !== 'server-to-client') {
      return;
    }
    this.received.push(data.payload);
  };

  constructor() {
    window.addEventListener('message', this.handler);
  }

  send(payload: unknown): void {
    postToServer({channel: CHANNEL, type: 'mcp', direction: 'client-to-server', payload});
  }

  /** Sends a request and resolves with the matching response. */
  async request(method: string, params?: Record<string, unknown>, id: number | string = next()): Promise<any> {
    this.send({jsonrpc: '2.0', id, method, params});
    await settle();
    const response = this.received.find(
      (m) => typeof m === 'object' && m !== null && (m as {id?: unknown}).id === id,
    );
    if (!response) throw new Error(`No response for ${method} (id ${id}).`);
    return response;
  }

  messages(): unknown[] {
    return this.received;
  }

  clear(): void {
    this.received.length = 0;
  }

  dispose(): void {
    window.removeEventListener('message', this.handler);
  }
}

let idCounter = 0;
const next = () => ++idCounter;

/**
 * jsdom's same-window `window.postMessage` sets `event.origin` to `''` and leaves
 * `event.source` null; a real browser sets both, and the bridge (like
 * `@mcp-b/transports`) checks them as its access control. So the tests dispatch a
 * faithful MessageEvent instead of using postMessage for the client-to-server
 * direction — compensating for the test environment, not weakening the check.
 *
 * The real-browser behaviour is verified separately in webmcp-angular-playground.
 */
function postToServer(data: unknown, origin = window.location.origin): void {
  window.dispatchEvent(new MessageEvent('message', {data, origin, source: window}));
}

/** jsdom delivers postMessage asynchronously; let the queue drain. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('createWebMcpBridge', () => {
  let harness: ReturnType<typeof installWebMcpTestHarness>;
  let bridge: ReturnType<typeof createWebMcpBridge>;
  let client: TestClient;
  let root: EnvironmentInjector;

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

  beforeEach(async () => {
    harness = installWebMcpTestHarness();
    root = Injector.create({providers: []}) as EnvironmentInjector;
    await declareWebMcpTool(greet, root);

    bridge = createWebMcpBridge({
      allowedOrigins: [window.location.origin],
      serverInfo: {name: 'test-app', version: '1.2.3'},
    });
    client = new TestClient();
    bridge.start();
    await settle();
    client.clear();
  });

  afterEach(() => {
    bridge.stop();
    client.dispose();
    harness.uninstall();
  });

  it('requires at least one allowed origin', () => {
    expect(() => createWebMcpBridge({allowedOrigins: []})).toThrow(/at least one allowed origin/i);
  });

  it('answers the readiness handshake', async () => {
    client.send('mcp-check-ready');
    await settle();
    expect(client.messages()).toContain('mcp-server-ready');
  });

  it('negotiates initialize and advertises listChanged', async () => {
    const response = await client.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: {name: 'test-client', version: '1.0.0'},
    });

    expect(response.result.protocolVersion).toBe('2025-11-25');
    expect(response.result.serverInfo).toEqual({name: 'test-app', version: '1.2.3'});
    // The tool list really does change as the user navigates, so a client that
    // caches it would go stale.
    expect(response.result.capabilities.tools.listChanged).toBe(true);
  });

  it('echoes back an older protocol version it supports', async () => {
    const response = await client.request('initialize', {protocolVersion: '2025-06-18'});
    expect(response.result.protocolVersion).toBe('2025-06-18');
  });

  it('falls back to its own version for an unknown one', async () => {
    const response = await client.request('initialize', {protocolVersion: '1999-01-01'});
    expect(response.result.protocolVersion).toBe('2025-11-25');
  });

  it('lists the page\'s tools', async () => {
    const response = await client.request('tools/list');
    expect(response.result.tools).toEqual([
      {
        name: 'greet',
        title: 'greet',
        description: 'Greets someone.',
        inputSchema: {
          type: 'object',
          properties: {who: {type: 'string'}},
          required: ['who'],
        },
      },
    ]);
  });

  it('calls a tool and returns MCP content', async () => {
    const response = await client.request('tools/call', {name: 'greet', arguments: {who: 'world'}});
    // executeTool JSON-stringifies the result, which is what a real browser does.
    expect(response.result.content[0].type).toBe('text');
    expect(response.result.content[0].text).toContain('hello world');
    expect(response.result.isError).toBeUndefined();
  });

  it('reports an unknown tool as invalid params, not a crash', async () => {
    const response = await client.request('tools/call', {name: 'nope', arguments: {}});
    expect(response.error.code).toBe(-32602);
    expect(response.error.message).toContain('nope');
  });

  it('rejects tools/call without a name', async () => {
    const response = await client.request('tools/call', {arguments: {}});
    expect(response.error.code).toBe(-32602);
  });

  it('returns isError for a tool that throws, rather than a protocol error', async () => {
    await declareWebMcpTool(
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

    const response = await client.request('tools/call', {name: 'boom', arguments: {}});
    // MCP convention: the model is meant to read the failure and adapt, so a failing
    // tool is a successful call with isError set.
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain('kaboom');
    expect(response.error).toBeUndefined();
  });

  it('answers ping', async () => {
    const response = await client.request('ping');
    expect(response.result).toEqual({});
  });

  it('reports method not found for an unknown method', async () => {
    const response = await client.request('resources/list');
    expect(response.error.code).toBe(-32601);
  });

  it('never answers a notification', async () => {
    client.send({jsonrpc: '2.0', method: 'notifications/initialized'});
    await settle();
    expect(client.messages()).toEqual([]);
  });

  it('emits tools/list_changed when the page fires toolchange', async () => {
    const child = Injector.create({providers: [], parent: root}) as EnvironmentInjector;
    await declareWebMcpTool(
      {
        name: 'transient',
        description: 'Comes and goes.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => 'x',
      },
      child,
    );
    await settle();

    const notifications = client
      .messages()
      .filter((m: any) => m?.method === 'notifications/tools/list_changed');
    expect(notifications.length).toBeGreaterThan(0);

    client.clear();
    child.destroy();
    await settle();
    expect(
      client.messages().filter((m: any) => m?.method === 'notifications/tools/list_changed').length,
    ).toBeGreaterThan(0);
  });

  it('notifies even when toolchange only fires on the model context', async () => {
    // @mcp-b/webmcp-polyfill 5.1.0 dispatches `toolchange` on the ModelContext
    // object and never on the document, so a bridge listening only on the document
    // silently stops notifying. Verified in Chrome; pinned here.
    client.clear();
    (document.modelContext as unknown as EventTarget).dispatchEvent(new Event('toolchange'));
    await settle();

    expect(
      client.messages().filter((m: any) => m?.method === 'notifications/tools/list_changed').length,
    ).toBeGreaterThan(0);
  });

  it('ignores traffic on a different channel', async () => {
    postToServer({
      channel: 'some-other-channel',
      type: 'mcp',
      direction: 'client-to-server',
      payload: {jsonrpc: '2.0', id: 999, method: 'tools/list'},
    });
    await settle();
    expect(client.messages()).toEqual([]);
  });

  it('ignores traffic from a disallowed origin', async () => {
    postToServer(
      {
        channel: CHANNEL,
        type: 'mcp',
        direction: 'client-to-server',
        payload: {jsonrpc: '2.0', id: 998, method: 'tools/list'},
      },
      'https://evil.example',
    );
    await settle();
    expect(client.messages()).toEqual([]);
  });

  it('ignores a payload that is not JSON-RPC', async () => {
    const errors: Error[] = [];
    const strict = createWebMcpBridge({
      allowedOrigins: [window.location.origin],
      channelId: 'strict-channel',
      onError: (e) => errors.push(e),
    });
    strict.start();
    await settle();

    postToServer({
      channel: 'strict-channel',
      type: 'mcp',
      direction: 'client-to-server',
      payload: {nope: true},
    });
    await settle();

    expect(errors.map((e) => e.message)).toContain('Ignoring a malformed JSON-RPC message.');
    strict.stop();
  });

  it('says server-stopped on stop and goes quiet', async () => {
    bridge.stop();
    await settle();
    expect(client.messages()).toContain('mcp-server-stopped');

    client.clear();
    client.send({jsonrpc: '2.0', id: 4242, method: 'tools/list'});
    await settle();
    expect(client.messages()).toEqual([]);
  });

  it('reports running state', () => {
    expect(bridge.running).toBe(true);
    bridge.stop();
    expect(bridge.running).toBe(false);
  });
});
