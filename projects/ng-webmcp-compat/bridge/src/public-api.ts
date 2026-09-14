/*
 * ng-webmcp-compat/bridge
 *
 * NON-MIGRATING entry point: Angular v22 has no equivalent, and none is planned.
 * This is the one capability that might outlive the migration — see the README.
 *
 * ── What this is ────────────────────────────────────────────────────────────
 *
 * WebMCP (the W3C draft) has no wire format: `document.modelContext` is a direct
 * in-page JavaScript API, meant for the browser's own agent. That means a tool
 * registered by your app is invisible to Claude Desktop, Cursor, or any other MCP
 * client outside the page.
 *
 * This bridge closes that gap. It speaks **MCP over JSON-RPC 2.0**, framed in
 * `window.postMessage` envelopes compatible with `@mcp-b/transports`'
 * `TabClientTransport`, and answers every request by delegating to
 * `document.modelContext`. A browser extension or the `@mcp-b/webmcp-local-relay`
 * can then connect and expose your page's tools to a desktop MCP client.
 *
 * Deliberately dependency-free: it implements the handful of MCP methods that
 * matter for tools rather than pulling in the MCP SDK, so this entry point stays
 * small and `@mcp-b/*` remains optional.
 */

// Type-only, and erased at compile time — but it is what brings the ambient
// `document.modelContext` / `navigator.modelContext` declarations into scope. Each
// entry point compiles in its own type context, so this cannot be inherited from
// the primary entry.
import type {ModelContext, RegisteredTool} from '@mcp-b/webmcp-types';

/** Matches `DEFAULT_TAB_CHANNEL_ID` in `@mcp-b/transports`. Both ends must agree. */
export const DEFAULT_CHANNEL_ID = 'mcp-default';

/**
 * MCP protocol version this bridge implements (`LATEST_PROTOCOL_VERSION` in
 * `@modelcontextprotocol/core` 2.0.0). During `initialize` the client's requested
 * version is echoed back when we recognise it, so older clients keep working.
 */
export const PROTOCOL_VERSION = '2025-11-25';

const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
];

export interface WebMcpBridgeOptions {
  /**
   * Origins permitted to talk to this bridge. **Required, and deliberately not
   * defaulted** — a page that accepts JSON-RPC from any origin lets any embedder
   * drive its tools. Pass `['*']` only if you mean it.
   */
  allowedOrigins: readonly string[];
  /** postMessage channel discriminator. Must match the client's. */
  channelId?: string;
  /** Reported to the MCP client during `initialize`. */
  serverInfo?: {name: string; version: string};
  /** Called for protocol-level problems. Defaults to a dev-mode console warning. */
  onError?: (error: Error) => void;
}

export interface WebMcpBridge {
  /** Begin listening and announce readiness to any waiting client. */
  start(): void;
  /** Stop listening and tell the client the server is gone. */
  stop(): void;
  /** Whether the bridge is currently listening. */
  readonly running: boolean;
}

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

const JSON_RPC_ERRORS = {
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

interface Envelope {
  channel: string;
  type: 'mcp';
  direction: 'client-to-server' | 'server-to-client';
  payload: unknown;
}

/**
 * Exposes this page's WebMCP tools to an MCP client over postMessage.
 *
 * ```ts
 * // main.ts, after the polyfill and before or after bootstrap
 * import {createWebMcpBridge} from 'ng-webmcp-compat/bridge';
 *
 * const bridge = createWebMcpBridge({
 *   allowedOrigins: [window.location.origin],
 *   serverInfo: {name: 'my-app', version: '1.0.0'},
 * });
 * bridge.start();
 * ```
 *
 * Tools are read from `document.modelContext` on every `tools/list`, so whatever
 * the page currently exposes is what the client sees — including tools that come
 * and go with navigation. A `notifications/tools/list_changed` is emitted whenever
 * the page fires `toolchange`, so a connected client refreshes on its own.
 */
export function createWebMcpBridge(options: WebMcpBridgeOptions): WebMcpBridge {
  if (!options.allowedOrigins?.length) {
    throw new Error(
      'createWebMcpBridge requires at least one allowed origin. Pass ["*"] only to ' +
        'deliberately disable origin checking.',
    );
  }

  const channel = options.channelId ?? DEFAULT_CHANNEL_ID;
  const allowed = new Set(options.allowedOrigins);
  const serverInfo = options.serverInfo ?? {name: 'ng-webmcp-compat', version: '0.0.0'};
  // Only fires on a malformed JSON-RPC message or an unexpected handler failure,
  // both of which are worth surfacing rather than swallowing.
  const onError =
    options.onError ??
    ((error: Error) => console.warn('[ng-webmcp-compat/bridge]', error.message));

  let running = false;
  let messageHandler: ((event: MessageEvent) => void) | undefined;
  let toolChangeHandler: (() => void) | undefined;

  const post = (payload: unknown): void => {
    const envelope: Envelope = {channel, type: 'mcp', direction: 'server-to-client', payload};
    // '*' matches @mcp-b/transports' TabServerTransport: the client is in this same
    // window, and inbound origin checking is what actually gates access.
    window.postMessage(envelope, '*');
  };

  const reply = (id: JsonRpcId, result: unknown): void => post({jsonrpc: '2.0', id, result});

  const replyError = (id: JsonRpcId, code: number, message: string): void =>
    post({jsonrpc: '2.0', id, error: {code, message}});

  const modelContext = (): ModelContext | undefined =>
    typeof document === 'undefined' ? undefined : document.modelContext ?? navigator.modelContext;

  async function handleRequest(request: JsonRpcRequest): Promise<void> {
    const id = request.id ?? null;

    // Notifications carry no id and must never be answered.
    const isNotification = request.id === undefined;

    switch (request.method) {
      case 'initialize': {
        const requested = request.params?.['protocolVersion'];
        const version =
          typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : PROTOCOL_VERSION;
        reply(id, {
          protocolVersion: version,
          // `listChanged` is not a courtesy here — the tool list genuinely changes
          // as the user navigates, so a client that caches it will go stale.
          capabilities: {tools: {listChanged: true}},
          serverInfo,
        });
        return;
      }

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;

      case 'ping':
        if (!isNotification) reply(id, {});
        return;

      case 'tools/list': {
        const context = modelContext();
        if (!context) {
          reply(id, {tools: []});
          return;
        }
        const tools = await context.getTools();
        reply(id, {
          tools: tools.map((tool: RegisteredTool) => ({
            name: tool.name,
            // The spec defaults `title` to '' rather than omitting it, so `??`
            // would not fall through.
            title: tool.title || tool.name,
            description: tool.description,
            inputSchema: normalizeSchema(tool.inputSchema),
          })),
        });
        return;
      }

      case 'tools/call': {
        const name = request.params?.['name'];
        if (typeof name !== 'string') {
          replyError(id, JSON_RPC_ERRORS.invalidParams, 'tools/call requires a string "name".');
          return;
        }

        const context = modelContext();
        const tool = context
          ? (await context.getTools()).find((t: RegisteredTool) => t.name === name)
          : undefined;
        if (!context || !tool) {
          replyError(id, JSON_RPC_ERRORS.invalidParams, `No tool named "${name}" is registered.`);
          return;
        }

        const execute = (context as {executeTool?: Function}).executeTool;
        if (typeof execute !== 'function') {
          replyError(
            id,
            JSON_RPC_ERRORS.internalError,
            'This browser exposes WebMCP tools but cannot execute them (no executeTool). ' +
              'Install @mcp-b/webmcp-polyfill.',
          );
          return;
        }

        try {
          const args = (request.params?.['arguments'] as unknown) ?? {};
          const raw = await execute.call(context, tool, JSON.stringify(args));
          reply(id, {content: [{type: 'text', text: raw ?? ''}]});
        } catch (error) {
          // MCP convention: a tool that fails returns isError, not a protocol
          // error — the model is meant to read the failure and adapt.
          reply(id, {
            content: [{type: 'text', text: (error as Error).message ?? String(error)}],
            isError: true,
          });
        }
        return;
      }

      default:
        if (!isNotification) {
          replyError(id, JSON_RPC_ERRORS.methodNotFound, `Unknown method "${request.method}".`);
        }
    }
  }

  return {
    get running() {
      return running;
    },

    start(): void {
      if (running) return;
      if (typeof window === 'undefined') {
        // Server render: nothing to listen on, and no client to serve.
        return;
      }

      messageHandler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (!allowed.has('*') && !allowed.has(event.origin)) return;

        const data = event.data as Envelope | undefined;
        if (
          typeof data !== 'object' ||
          !data ||
          data.channel !== channel ||
          data.type !== 'mcp' ||
          data.direction !== 'client-to-server' ||
          !('payload' in data)
        ) {
          return;
        }

        const {payload} = data;

        // The transport's readiness handshake, which is not JSON-RPC.
        if (payload === 'mcp-check-ready') {
          post('mcp-server-ready');
          return;
        }

        if (
          typeof payload !== 'object' ||
          !payload ||
          (payload as JsonRpcRequest).jsonrpc !== '2.0' ||
          typeof (payload as JsonRpcRequest).method !== 'string'
        ) {
          onError(new Error('Ignoring a malformed JSON-RPC message.'));
          return;
        }

        void handleRequest(payload as JsonRpcRequest).catch((error: Error) => {
          onError(error);
          const id = (payload as JsonRpcRequest).id;
          if (id !== undefined) {
            replyError(id ?? null, JSON_RPC_ERRORS.internalError, error.message);
          }
        });
      };

      window.addEventListener('message', messageHandler);

      // Tools genuinely come and go as the user navigates, so tell the client.
      //
      // Listen on BOTH the document and the ModelContext object. The spec says
      // `toolchange` fires on the document, but `@mcp-b/webmcp-polyfill` 5.1.0
      // dispatches it only on the ModelContext — measured in Chrome. Listening on
      // the document alone means a polyfill-backed page never notifies, and a
      // connected MCP client silently goes stale while `tools/list` keeps
      // returning fresh results on demand.
      toolChangeHandler = () => post({jsonrpc: '2.0', method: 'notifications/tools/list_changed'});
      document.addEventListener('toolchange', toolChangeHandler);
      modelContext()?.addEventListener?.('toolchange', toolChangeHandler);

      running = true;
      post('mcp-server-ready');
    },

    stop(): void {
      if (!running) return;
      if (messageHandler) window.removeEventListener('message', messageHandler);
      if (toolChangeHandler) {
        document.removeEventListener('toolchange', toolChangeHandler);
        modelContext()?.removeEventListener?.('toolchange', toolChangeHandler);
      }
      messageHandler = undefined;
      toolChangeHandler = undefined;
      running = false;
      post('mcp-server-stopped');
    },
  };
}

/** `inputSchema` is a JSON string on Chrome 149–153 and an object from 154. */
function normalizeSchema(schema: unknown): Record<string, unknown> {
  let value = schema;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {type: 'object', properties: {}};
}
