/*
 * webmcp-angular/testing
 *
 * NON-MIGRATING entry point: Angular v22 ships no test harness. Anything imported
 * from here must be replaced by hand when migrating to @angular/core — though the
 * harness is framework-agnostic and does not depend on the rest of this package's
 * runtime, so it can simply be vendored into your own test utilities.
 */

/** A tool as the browser holds it, after registration. */
export interface HarnessTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: unknown;
  execute: (args: unknown, client: {signal: AbortSignal}) => unknown;
}

/** One recorded invocation. */
export interface HarnessCall {
  name: string;
  args: unknown;
  result?: unknown;
  error?: unknown;
}

export interface WebMcpHarness {
  /** Names of every currently-registered tool, sorted. */
  toolNames(): string[];
  /** Whether a tool is registered right now. */
  has(name: string): boolean;
  /** The registered tool, or `undefined`. */
  get(name: string): HarnessTool | undefined;
  /**
   * Invoke a tool the way an agent would, and return whatever it returned.
   *
   * Rejects if no such tool is registered — which is usually the assertion you
   * actually wanted, since a tool silently failing to register is the most common
   * WebMCP bug.
   */
  invoke(name: string, args?: unknown, options?: {signal?: AbortSignal}): Promise<unknown>;
  /** Every invocation made through {@link invoke}, in order. */
  calls(): readonly HarnessCall[];
  /** Forget recorded calls. Registered tools are untouched. */
  clearCalls(): void;
  /** Remove the harness and restore whatever was on `document` before. */
  uninstall(): void;
}

class HarnessModelContext extends EventTarget {
  readonly tools = new Map<string, HarnessTool>();
  readonly calls: HarnessCall[] = [];

  /**
   * The spec fires `toolchange` on the **document** (and descendants), not only on
   * the ModelContext object — so anything listening the way a real integration
   * would, e.g. `document.addEventListener('toolchange', …)`, must be notified.
   * Dispatching only on the context made a correct bridge look broken.
   */
  private announceToolChange(): void {
    this.dispatchEvent(new Event('toolchange'));
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new Event('toolchange'));
    }
  }

  async registerTool(tool: HarnessTool, options?: {signal?: AbortSignal}): Promise<void> {
    if (this.tools.has(tool.name)) {
      // Matches the spec, and therefore matches what a real browser does to you.
      throw new DOMException(`Tool "${tool.name}" is already registered.`, 'InvalidStateError');
    }

    this.tools.set(tool.name, tool);
    this.announceToolChange();

    // There is no unregisterTool in the spec — aborting the signal IS how a tool
    // goes away, so the harness must honour it or lifecycle tests are meaningless.
    options?.signal?.addEventListener('abort', () => {
      if (this.tools.get(tool.name) === tool) {
        this.tools.delete(tool.name);
        this.announceToolChange();
      }
    });
  }

  async getTools(): Promise<Array<Omit<HarnessTool, 'execute'>>> {
    return [...this.tools.values()].map(({name, title, description, inputSchema}) => ({
      name,
      title,
      description,
      inputSchema,
    }));
  }

  async executeTool(
    tool: {name: string},
    inputArgumentsJson: string,
    options?: {signal?: AbortSignal},
  ): Promise<string | null> {
    const result = await this.invoke(tool.name, safeParse(inputArgumentsJson), options);
    return result === undefined ? null : JSON.stringify(result);
  }

  async invoke(name: string, args: unknown, options?: {signal?: AbortSignal}): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      const available = [...this.tools.keys()].sort().join(', ') || 'none';
      throw new Error(
        `No WebMCP tool named "${name}" is registered. Currently registered: ${available}.`,
      );
    }

    const call: HarnessCall = {name, args};
    this.calls.push(call);

    try {
      const result = await tool.execute(args, {
        signal: options?.signal ?? new AbortController().signal,
      });
      call.result = result;
      return result;
    } catch (error) {
      call.error = error;
      throw error;
    }
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Installs an in-memory `document.modelContext` for tests.
 *
 * Lets you assert on what your app exposes to agents without a browser that
 * implements WebMCP, and without the polyfill:
 *
 * ```ts
 * const webmcp = installWebMcpTestHarness();
 * afterEach(() => webmcp.uninstall());
 *
 * it('exposes add_to_cart', async () => {
 *   TestBed.configureTestingModule({providers: [provideExperimentalWebMcpTools([addToCart])]});
 *   TestBed.inject(ApplicationRef);              // force environment initializers to run
 *
 *   expect(webmcp.has('add_to_cart')).toBe(true);
 *   expect(await webmcp.invoke('add_to_cart', {sku: 'A1', qty: 2})).toEqual({ok: true});
 * });
 * ```
 *
 * It implements the parts of the spec that change test outcomes: duplicate names
 * reject with `InvalidStateError`, `AbortSignal` really unregisters (so a test that
 * destroys an injector observes the tool disappear, exactly as in a browser), and
 * `toolchange` fires on **both** the model context and the `document` — the spec
 * dispatches it on the document, so anything listening there must be notified.
 */
export function installWebMcpTestHarness(): WebMcpHarness {
  if (typeof document === 'undefined') {
    throw new Error(
      'installWebMcpTestHarness() needs a DOM. Use a jsdom/happy-dom test environment, ' +
        'or a browser test runner.',
    );
  }

  const previous = Object.getOwnPropertyDescriptor(document, 'modelContext');
  const context = new HarnessModelContext();

  Object.defineProperty(document, 'modelContext', {
    value: context,
    configurable: true,
    writable: true,
  });

  return {
    toolNames: () => [...context.tools.keys()].sort(),
    has: (name) => context.tools.has(name),
    get: (name) => context.tools.get(name),
    invoke: (name, args = {}, options) => context.invoke(name, args, options),
    calls: () => context.calls,
    clearCalls: () => void context.calls.splice(0, context.calls.length),
    uninstall: () => {
      if (previous) {
        Object.defineProperty(document, 'modelContext', previous);
      } else {
        delete (document as {modelContext?: unknown}).modelContext;
      }
    },
  };
}
