import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {Injector, type EnvironmentInjector} from '@angular/core';

import {mountWebMcpDevtools} from '../../dist/webmcp-angular/fesm2022/webmcp-angular-devtools.mjs';
import {installWebMcpTestHarness} from '../../dist/webmcp-angular/fesm2022/webmcp-angular-testing.mjs';
import {declareExperimentalWebMcpTool} from '../../dist/webmcp-angular/fesm2022/webmcp-angular.mjs';

/**
 * M9 — the devtools inspector.
 *
 * Mostly a UI, so these tests target the parts that are actually easy to get
 * quietly wrong: reading the live tool list, prefilling arguments from a schema,
 * invoking through `executeTool`, and tearing down cleanly.
 */

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

const shadow = () => {
  const host = document.querySelector('[data-webmcp-angular-devtools]');
  if (!host?.shadowRoot) throw new Error('Devtools host not mounted.');
  return host.shadowRoot;
};

const text = (sel: string) => shadow().querySelector(sel)?.textContent?.trim() ?? '';

describe('mountWebMcpDevtools', () => {
  let harness: ReturnType<typeof installWebMcpTestHarness>;
  let panel: ReturnType<typeof mountWebMcpDevtools> | undefined;
  let root: EnvironmentInjector;

  const greet = {
    name: 'greet',
    description: 'Greets someone by name.',
    inputSchema: {
      type: 'object',
      properties: {
        who: {type: 'string'},
        times: {type: 'integer', minimum: 2},
        loud: {type: 'boolean'},
        tone: {type: 'string', enum: ['warm', 'curt']},
      },
      required: ['who'],
    },
    execute: ({who}: {who: string}) => `hello ${who}`,
  };

  beforeEach(async () => {
    harness = installWebMcpTestHarness();
    root = Injector.create({providers: []}) as EnvironmentInjector;
    await declareExperimentalWebMcpTool(greet, root);
  });

  afterEach(() => {
    panel?.destroy();
    panel = undefined;
    harness.uninstall();
    document.querySelectorAll('[data-webmcp-angular-devtools]').forEach((n) => n.remove());
  });

  it('mounts into a shadow root, so app styles cannot reach it', async () => {
    panel = mountWebMcpDevtools();
    await settle();

    const host = document.querySelector('[data-webmcp-angular-devtools]');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
    // Nothing leaks into the light DOM beyond the single host element.
    expect(host!.children.length).toBe(0);
  });

  it('lists the registered tools and counts them', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();

    expect(text('.count')).toBe('1');
    expect(text('.tools')).toContain('greet');
    expect(text('.tools')).toContain('Greets someone by name.');
  });

  it('reports a connected, executable implementation', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();
    expect(text('.status')).toBe('connected');
  });

  it('starts collapsed unless asked to open', async () => {
    panel = mountWebMcpDevtools();
    await settle();
    expect(shadow().querySelector<HTMLElement>('.panel')!.hidden).toBe(true);

    panel.open();
    expect(shadow().querySelector<HTMLElement>('.panel')!.hidden).toBe(false);

    panel.close();
    expect(shadow().querySelector<HTMLElement>('.panel')!.hidden).toBe(true);
  });

  it('updates live when a tool is registered or unregistered', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();
    expect(text('.count')).toBe('1');

    const child = Injector.create({providers: [], parent: root}) as EnvironmentInjector;
    await declareExperimentalWebMcpTool(
      {
        name: 'transient',
        description: 'Comes and goes.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => 'x',
      },
      child,
    );
    await settle();
    expect(text('.count')).toBe('2');

    child.destroy();
    await settle();
    expect(text('.count')).toBe('1');
  });

  it('prefills arguments from the schema, required fields first', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();

    shadow().querySelector<HTMLButtonElement>('.tool-head')!.click();
    await settle();

    const box = shadow().querySelector<HTMLTextAreaElement>('textarea.args')!;
    const parsed = JSON.parse(box.value);

    // Required first, so the field a tool will reject you for omitting is at the top.
    expect(Object.keys(parsed)[0]).toBe('who');
    expect(parsed).toEqual({who: '', times: 2, loud: false, tone: 'warm'});
  });

  it('invokes the tool through executeTool and shows the result', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();

    shadow().querySelector<HTMLButtonElement>('.tool-head')!.click();
    await settle();

    const box = shadow().querySelector<HTMLTextAreaElement>('textarea.args')!;
    box.value = JSON.stringify({who: 'world'});
    shadow().querySelector<HTMLButtonElement>('.run')!.click();
    await settle();

    const output = shadow().querySelector<HTMLElement>('.output')!;
    expect(output.hidden).toBe(false);
    expect(output.textContent).toContain('hello world');
    expect(output.className).not.toContain('failed');
    // The call is recorded so you can see what you ran.
    expect(text('.log')).toContain('greet');
  });

  it('keeps in-progress edits and the last result across a re-render', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();
    shadow().querySelector<HTMLButtonElement>('.tool-head')!.click();
    await settle();

    const box = shadow().querySelector<HTMLTextAreaElement>('textarea.args')!;
    box.value = '{"who": "half-typed"}';
    box.dispatchEvent(new Event('input'));

    shadow().querySelector<HTMLButtonElement>('.run')!.click();
    await settle();

    // A toolchange re-renders the expanded tool. Without draft preservation this
    // silently wipes what the user was typing, and the result they just got.
    const child = Injector.create({providers: [], parent: root}) as EnvironmentInjector;
    await declareExperimentalWebMcpTool(
      {
        name: 'noise',
        description: 'Triggers a re-render.',
        inputSchema: {type: 'object', properties: {}},
        execute: () => 'x',
      },
      child,
    );
    await settle();

    expect(shadow().querySelector<HTMLTextAreaElement>('textarea.args')!.value).toBe(
      '{"who": "half-typed"}',
    );
    expect(shadow().querySelector<HTMLElement>('.output')!.textContent).toContain('hello half-typed');
    child.destroy();
  });

  it('rejects malformed JSON without attempting a call', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();
    shadow().querySelector<HTMLButtonElement>('.tool-head')!.click();
    await settle();

    shadow().querySelector<HTMLTextAreaElement>('textarea.args')!.value = '{not json';
    shadow().querySelector<HTMLButtonElement>('.run')!.click();
    await settle();

    const output = shadow().querySelector<HTMLElement>('.output')!;
    expect(output.className).toContain('failed');
    expect(output.textContent).toContain('not valid JSON');
    expect(harness.calls()).toEqual([]);
  });

  it('surfaces a throwing tool as a failed result', async () => {
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

    panel = mountWebMcpDevtools({open: true});
    await settle();

    const heads = [...shadow().querySelectorAll<HTMLButtonElement>('.tool-head')];
    heads.find((h) => h.textContent?.includes('boom'))!.click();
    await settle();

    shadow().querySelector<HTMLButtonElement>('.run')!.click();
    await settle();

    const output = shadow().querySelector<HTMLElement>('.output')!;
    expect(output.className).toContain('failed');
    expect(output.textContent).toContain('kaboom');
  });

  it('says so, and disables Run, when the implementation cannot execute', async () => {
    harness.uninstall();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      // A spec-only implementation: getTools but no executeTool.
      value: {
        getTools: async () => [
          {name: 'readonly_tool', description: 'Listed but not runnable.', inputSchema: {}},
        ],
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });

    panel = mountWebMcpDevtools({open: true});
    await settle();

    expect(text('.status')).toContain('read-only');
    shadow().querySelector<HTMLButtonElement>('.tool-head')!.click();
    await settle();
    expect(shadow().querySelector<HTMLButtonElement>('.run')!.disabled).toBe(true);

    delete (document as {modelContext?: unknown}).modelContext;
  });

  it('reports an unsupported browser rather than rendering an empty panel', async () => {
    harness.uninstall();
    delete (document as {modelContext?: unknown}).modelContext;

    panel = mountWebMcpDevtools({open: true});
    await settle();

    expect(text('.status')).toContain('unavailable');
    expect(text('.tools')).toContain('polyfill');
  });

  it('removes the host and its listeners on destroy', async () => {
    panel = mountWebMcpDevtools({open: true});
    await settle();
    expect(document.querySelector('[data-webmcp-angular-devtools]')).not.toBeNull();

    panel.destroy();
    panel = undefined;
    expect(document.querySelector('[data-webmcp-angular-devtools]')).toBeNull();

    // A toolchange after destroy must not throw from a stale listener.
    document.dispatchEvent(new Event('toolchange'));
    await settle();
  });

  it('toggles on Ctrl/Cmd + Shift + M', async () => {
    panel = mountWebMcpDevtools();
    await settle();
    const el = () => shadow().querySelector<HTMLElement>('.panel')!;
    expect(el().hidden).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'M', ctrlKey: true, shiftKey: true}));
    expect(el().hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', metaKey: true, shiftKey: true}));
    expect(el().hidden).toBe(true);
  });
});
