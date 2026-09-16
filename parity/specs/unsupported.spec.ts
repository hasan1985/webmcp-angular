import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {Injector, createEnvironmentInjector, type EnvironmentInjector} from '@angular/core';

// The built artifact again — this is about what ships, not what compiles.
import {
  declareWebMcpTool,
  isWebMcpSupported,
  normalizeInputSchema,
  displayTitle,
  provideWebMcpTools,
  resolveModelContext,
} from '../../dist/webmcp-angular/fesm2022/webmcp-angular.mjs';

/**
 * M4 — a browser with no WebMCP and no polyfill.
 *
 * That is Firefox and Safari today, and Chrome without the flag. `document` and
 * `navigator` exist; `modelContext` does not.
 *
 * The contract is **silence**. Not a warning, not a throw — `@angular/core` v22
 * returns early with no comment, so anything louder is a parity break. A library
 * that logs on every unsupported page would be intolerable in a real app.
 */
describe('unsupported browser (document exists, modelContext does not)', () => {
  let root: EnvironmentInjector;
  let logged: unknown[][];
  const original = {log: console.log, warn: console.warn, error: console.error};

  beforeEach(() => {
    delete (document as {modelContext?: unknown}).modelContext;
    delete (navigator as {modelContext?: unknown}).modelContext;
    root = Injector.create({providers: []}) as EnvironmentInjector;

    logged = [];
    console.log = (...a: unknown[]) => void logged.push(['log', ...a]);
    console.warn = (...a: unknown[]) => void logged.push(['warn', ...a]);
    console.error = (...a: unknown[]) => void logged.push(['error', ...a]);
  });

  afterEach(() => {
    Object.assign(console, original);
  });

  it('confirms the environment: document present, modelContext absent', () => {
    expect(typeof document).toBe('object');
    expect(document.modelContext).toBeUndefined();
    expect(navigator.modelContext).toBeUndefined();
  });

  it('reports unsupported without throwing', () => {
    expect(isWebMcpSupported()).toBe(false);
    expect(resolveModelContext().source).toBe('none');
  });

  it('registration resolves quietly and never runs execute', async () => {
    let ran = false;
    await expect(
      declareWebMcpTool(
        {
          name: 'nowhere',
          description: 'No agent can ever see this.',
          inputSchema: {type: 'object', properties: {}},
          execute: () => {
            ran = true;
            return 'x';
          },
        },
        root,
      ),
    ).resolves.toBeUndefined();
    expect(ran).toBe(false);
  });

  it('the provider path is inert too', () => {
    expect(() =>
      createEnvironmentInjector(
        [
          provideWebMcpTools([
            {
              name: 'nowhere_provided',
              description: 'No agent can ever see this.',
              inputSchema: {type: 'object', properties: {}},
              execute: () => 'x',
            },
          ]),
        ],
        root,
      ),
    ).not.toThrow();
  });

  it('says nothing at all — matching v22, which returns early without comment', async () => {
    await declareWebMcpTool(
      {
        name: 'quiet',
        description: 'Silence is the contract.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => 'x',
      },
      root,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logged).toEqual([]);
  });

  it('picks up navigator.modelContext when only the Chrome 149 surface exists', async () => {
    const registered: string[] = [];
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      value: {
        registerTool: async (tool: {name: string}) => void registered.push(tool.name),
        getTools: async () => [],
      },
    });

    expect(resolveModelContext().source).toBe('navigator');
    await declareWebMcpTool(
      {
        name: 'legacy_surface',
        description: 'Registers through the deprecated navigator surface.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => 'x',
      },
      root,
    );
    expect(registered).toEqual(['legacy_surface']);
  });
});

/**
 * FR-3.5 / FR-3.6 — reading tools back.
 *
 * `getTools()` returns `inputSchema` as a serialized JSON **string** on Chrome
 * 149–153 (most of the current origin-trial population) and as an **object** from
 * Chrome 154.0.8013 (webmcp#241). The polyfill returns the object form, so the
 * string arm cannot be reached in the playground — it is covered here instead.
 *
 * `title` defaults to the empty string rather than being omitted, so `??` does not
 * fall through to the name.
 */
describe('reading tools back across Chrome generations', () => {
  it('parses the Chrome 149–153 string schema', () => {
    expect(normalizeInputSchema('{"type":"object","properties":{"a":{"type":"string"}}}')).toEqual({
      type: 'object',
      properties: {a: {type: 'string'}},
    });
  });

  it('passes the Chrome 154+ object schema through', () => {
    const schema = {type: 'object', properties: {}};
    expect(normalizeInputSchema(schema)).toEqual(schema);
  });

  it('returns null rather than throwing on malformed or missing input', () => {
    expect(normalizeInputSchema('not json')).toBeNull();
    expect(normalizeInputSchema('"a string"')).toBeNull();
    expect(normalizeInputSchema(undefined)).toBeNull();
    expect(normalizeInputSchema(null)).toBeNull();
  });

  it('falls back to the name when title is the spec default empty string', () => {
    expect(displayTitle({name: 'add_note', title: ''})).toBe('add_note');
    expect(displayTitle({name: 'add_note'})).toBe('add_note');
    expect(displayTitle({name: 'add_note', title: 'Add note'})).toBe('Add note');
  });
});
