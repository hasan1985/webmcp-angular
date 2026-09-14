/**
 * A minimal in-memory stand-in for `document.modelContext`, implementing the
 * parts of the W3C WebMCP draft the parity suite depends on.
 *
 * Deliberately framework-free: it is the fixed point both implementations are
 * measured against, so it must not import Angular.
 */

export interface FakeTool {
  name: string;
  description: string;
  inputSchema?: unknown;
  execute: (args: unknown, client: {signal: AbortSignal}) => unknown;
}

export class FakeModelContext {
  private readonly tools = new Map<string, FakeTool>();

  /** Every registerTool call seen, including ones that went on to reject. */
  readonly registerCalls: Array<{tool: FakeTool; options?: {signal?: AbortSignal}}> = [];

  async registerTool(tool: FakeTool, options?: {signal?: AbortSignal}): Promise<void> {
    this.registerCalls.push({tool, options});

    // Spec: duplicate names reject with InvalidStateError.
    if (this.tools.has(tool.name)) {
      throw new DOMException(
        `Tool "${tool.name}" is already registered.`,
        'InvalidStateError',
      );
    }

    this.tools.set(tool.name, tool);

    // Spec: there is no unregisterTool — aborting the signal IS unregistration.
    options?.signal?.addEventListener('abort', () => {
      if (this.tools.get(tool.name) === tool) {
        this.tools.delete(tool.name);
      }
    });
  }

  async getTools(): Promise<Array<{name: string; description: string; inputSchema?: unknown}>> {
    return [...this.tools.values()].map(({name, description, inputSchema}) => ({
      name,
      description,
      inputSchema,
    }));
  }

  /** Stands in for the agent invoking a tool. */
  async executeTool(name: string, args: unknown, signal?: AbortSignal): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new DOMException(`No tool named "${name}".`, 'UnknownError');
    }
    return await tool.execute(args, {signal: signal ?? new AbortController().signal});
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get size(): number {
    return this.tools.size;
  }
}

/** Installs a fresh fake on `document` and returns it plus a teardown. */
export function installFakeModelContext(): {
  fake: FakeModelContext;
  uninstall: () => void;
} {
  const fake = new FakeModelContext();
  Object.defineProperty(document, 'modelContext', {
    value: fake,
    configurable: true,
    writable: true,
  });
  return {
    fake,
    uninstall: () => {
      delete (document as {modelContext?: unknown}).modelContext;
    },
  };
}
