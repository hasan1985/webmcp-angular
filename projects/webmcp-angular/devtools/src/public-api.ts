/*
 * webmcp-angular/devtools
 *
 * No `@angular/core` equivalent — Angular ships no inspector. Development only, and
 * independent of which core API you use.
 *
 * ── Design notes ────────────────────────────────────────────────────────────
 *
 * Plain DOM in a shadow root rather than an Angular component, for three reasons:
 *
 *  1. No Angular import, so this entry point cannot perturb change detection,
 *     zoneless scheduling, or the injector tree it is meant to observe.
 *  2. A shadow root means app styles cannot leak in and panel styles cannot leak
 *     out — an inspector that restyles the app it is inspecting is worse than none.
 *  3. Mounting via a function (not a component in a template) keeps it behind a
 *     dynamic import, so it lands in its own lazy chunk instead of your main bundle.
 */

import type {ModelContext, RegisteredTool} from '@mcp-b/webmcp-types';

/**
 * Where the panel sits.
 *
 * The four corners float above the page. `'inline'` drops the fixed positioning
 * entirely and lets the panel flow inside its `container` as an ordinary block —
 * use it when the host app has a layout to give it, so it becomes a real panel
 * rather than something covering one.
 */
export type WebMcpDevtoolsPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | 'inline';

export interface WebMcpDevtoolsOptions {
  /** Where to attach. Defaults to `document.body`. */
  container?: HTMLElement;
  /**
   * Default `'bottom-right'`. Pick another corner when that one is already
   * occupied, or `'inline'` to dock it into your own layout.
   */
  position?: WebMcpDevtoolsPosition;
  /** Start expanded rather than as a collapsed pill. Default `false`. */
  open?: boolean;
  /** Toggle shortcut. Default `true` → Ctrl/Cmd + Shift + M. */
  shortcut?: boolean;
}

export interface WebMcpDevtools {
  /** Show the panel. */
  open(): void;
  /** Collapse to the pill. */
  close(): void;
  /** Re-read the tool list now. */
  refresh(): void;
  /** Remove the panel and all its listeners. */
  destroy(): void;
}

interface LogEntry {
  tool: string;
  args: string;
  output: string;
  failed: boolean;
  at: Date;
}

/**
 * Mounts an inspector showing every WebMCP tool the page currently exposes, with
 * their schemas, and lets you invoke them by hand.
 *
 * Floats in the bottom-right corner by default. If your app already uses that
 * corner — a chat panel, a support widget — pass another corner, or `'inline'`
 * with a `container` to dock it into your own layout as a real panel:
 *
 * ```ts
 * mountWebMcpDevtools({position: 'inline', container: slotElement});
 * ```
 *
 * Keep it out of production by loading it dynamically:
 *
 * ```ts
 * import {isDevMode} from '@angular/core';
 *
 * if (isDevMode()) {
 *   const {mountWebMcpDevtools} = await import('webmcp-angular/devtools');
 *   mountWebMcpDevtools();
 * }
 * ```
 *
 * The dynamic import is what keeps it out of your **initial** bundle. Measured on a
 * production Angular build: the panel lands in its own lazy chunk (~8.6 kB raw,
 * ~3 kB transfer) which is emitted to disk but never downloaded, because
 * `isDevMode()` is false and the import never runs. A *static* import would pull the
 * same code into `main.js` unconditionally.
 *
 * If you need it gone from disk entirely, guard the call site with your own build
 * flag so the bundler can drop the branch.
 */
export function mountWebMcpDevtools(options: WebMcpDevtoolsOptions = {}): WebMcpDevtools {
  if (typeof document === 'undefined') {
    // Server render: nothing to mount onto. Return an inert handle rather than
    // throwing, so a caller need not guard.
    return {open: noop, close: noop, refresh: noop, destroy: noop};
  }

  const position = options.position ?? 'bottom-right';
  const inline = position === 'inline';

  const host = document.createElement('div');
  host.setAttribute('data-webmcp-angular-devtools', '');
  host.setAttribute('data-position', position);
  const shadow = host.attachShadow({mode: 'open'});
  shadow.innerHTML = TEMPLATE;
  (options.container ?? document.body).appendChild(host);

  // Positioning lives on the shadow root so page CSS cannot fight it.
  shadow.querySelector('.root')!.setAttribute('data-pos', position);

  const $ = <T extends HTMLElement>(sel: string) => shadow.querySelector(sel) as T;

  const panel = $<HTMLElement>('.panel');
  const pill = $<HTMLButtonElement>('.pill');
  const list = $<HTMLElement>('.tools');
  const count = $<HTMLElement>('.count');
  const status = $<HTMLElement>('.status');
  const log = $<HTMLElement>('.log');

  const entries: LogEntry[] = [];
  let expandedTool: string | null = null;

  /**
   * In-progress argument edits, kept per tool. `refresh()` re-renders the expanded
   * tool, and a `toolchange` can fire at any moment — without this, navigating or
   * registering a tool silently wipes whatever you were half way through typing.
   */
  const drafts = new Map<string, string>();
  const lastOutput = new Map<string, {text: string; failed: boolean}>();

  const context = (): ModelContext | undefined =>
    document.modelContext ?? navigator.modelContext;

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    pill.hidden = open;
  };

  async function refresh(): Promise<void> {
    const ctx = context();
    if (!ctx) {
      status.textContent = 'WebMCP unavailable in this browser';
      status.className = 'status bad';
      list.replaceChildren(el('p', {class: 'empty'}, 'No document.modelContext. Install @mcp-b/webmcp-polyfill.'));
      count.textContent = '0';
      return;
    }

    const canExecute = typeof (ctx as {executeTool?: unknown}).executeTool === 'function';
    status.textContent = canExecute ? 'connected' : 'connected (read-only)';
    status.className = canExecute ? 'status ok' : 'status warn';
    status.title = canExecute
      ? ''
      : 'This implementation has no executeTool, a Chromium extension the polyfill also provides. Tools can be listed but not invoked.';

    const tools = await ctx.getTools();
    count.textContent = String(tools.length);

    if (tools.length === 0) {
      list.replaceChildren(el('p', {class: 'empty'}, 'No tools registered right now.'));
      return;
    }

    list.replaceChildren(
      ...tools.map((tool: RegisteredTool) => renderTool(tool, canExecute)),
    );
  }

  function renderTool(tool: RegisteredTool, canExecute: boolean): HTMLElement {
    const schema = normalizeSchema(tool.inputSchema);
    const isOpen = expandedTool === tool.name;

    const header = el(
      'button',
      {class: 'tool-head'},
      el('span', {class: 'caret'}, isOpen ? '▾' : '▸'),
      // The spec defaults `title` to '' rather than omitting it, so `??` would not
      // fall through to the name.
      el('code', {}, tool.name),
      el('span', {class: 'desc'}, tool.description),
    );
    header.addEventListener('click', () => {
      expandedTool = isOpen ? null : tool.name;
      void refresh();
    });

    const wrapper = el('div', {class: `tool${isOpen ? ' open' : ''}`}, header);
    if (!isOpen) return wrapper;

    const input = el('textarea', {class: 'args', spellcheck: 'false'}) as HTMLTextAreaElement;
    input.value = drafts.get(tool.name) ?? JSON.stringify(sampleArgs(schema), null, 2);
    input.addEventListener('input', () => drafts.set(tool.name, input.value));

    // Survives re-render for the same reason the draft does.
    const output = el('pre', {class: 'output', hidden: ''});
    const previous = lastOutput.get(tool.name);
    if (previous) show(output, previous.text, previous.failed);

    const run = el('button', {class: 'run'}, 'Run') as HTMLButtonElement;
    run.disabled = !canExecute;
    if (!canExecute) run.title = 'This implementation cannot execute tools (no executeTool).';

    run.addEventListener('click', async () => {
      let args: unknown;
      try {
        args = JSON.parse(input.value || '{}');
      } catch (error) {
        const text = `Arguments are not valid JSON: ${(error as Error).message}`;
        show(output, text, true);
        lastOutput.set(tool.name, {text, failed: true});
        return;
      }

      run.disabled = true;
      run.textContent = 'Running…';
      try {
        const ctx = context()!;
        const execute = (ctx as {executeTool?: Function}).executeTool!;
        const result = await execute.call(ctx, tool, JSON.stringify(args));
        const text = result ?? '(no output)';
        show(output, text, false);
        lastOutput.set(tool.name, {text, failed: false});
        record({tool: tool.name, args: input.value, output: text, failed: false, at: new Date()});
      } catch (error) {
        const text = (error as Error).message ?? String(error);
        show(output, text, true);
        lastOutput.set(tool.name, {text, failed: true});
        record({tool: tool.name, args: input.value, output: text, failed: true, at: new Date()});
      } finally {
        run.disabled = !canExecute;
        run.textContent = 'Run';
      }
    });

    wrapper.append(
      el('details', {class: 'schema'}, el('summary', {}, 'inputSchema'), el('pre', {}, JSON.stringify(schema, null, 2))),
      el('label', {}, 'arguments'),
      input,
      run,
      output,
    );
    return wrapper;
  }

  function record(entry: LogEntry): void {
    entries.unshift(entry);
    entries.splice(20);
    log.replaceChildren(
      ...entries.map((e) =>
        el(
          'div',
          {class: `entry${e.failed ? ' failed' : ''}`},
          el('code', {}, e.tool),
          el('time', {}, e.at.toLocaleTimeString()),
          el('pre', {}, e.output.length > 240 ? `${e.output.slice(0, 240)}…` : e.output),
        ),
      ),
    );
  }

  // Listen on BOTH the document and the model context. The spec dispatches
  // `toolchange` on the document, but @mcp-b/webmcp-polyfill 5.1.0 dispatches it
  // only on the ModelContext — a document-only listener silently never updates on a
  // polyfill-backed page. See docs/history/M0-FINDINGS.md §8.
  const onToolChange = () => void refresh();
  document.addEventListener('toolchange', onToolChange);
  context()?.addEventListener?.('toolchange', onToolChange);

  const onKey = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      setOpen(panel.hidden);
    }
  };
  if (options.shortcut !== false) document.addEventListener('keydown', onKey);

  pill.addEventListener('click', () => setOpen(true));
  $<HTMLButtonElement>('.close').addEventListener('click', () => setOpen(false));
  $<HTMLButtonElement>('.refresh').addEventListener('click', () => void refresh());

  // An inline panel occupies a slot the host app deliberately gave it; collapsing
  // it to a pill would leave a hole in the layout, so it starts open.
  setOpen(options.open ?? inline);
  void refresh();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    refresh: () => void refresh(),
    destroy: () => {
      document.removeEventListener('toolchange', onToolChange);
      context()?.removeEventListener?.('toolchange', onToolChange);
      document.removeEventListener('keydown', onKey);
      host.remove();
    },
  };
}

function noop(): void {}

function show(target: HTMLElement, text: string, failed: boolean): void {
  target.textContent = text;
  target.className = `output${failed ? ' failed' : ''}`;
  target.hidden = false;
}

function el(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
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

/**
 * Prefills the argument box from the schema, so running a tool is one click rather
 * than a typing exercise. Required properties first — those are the ones a tool will
 * reject you for omitting.
 */
function sampleArgs(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((schema['required'] as string[] | undefined) ?? []);
  const keys = Object.keys(properties).sort(
    (a, b) => Number(required.has(b)) - Number(required.has(a)),
  );

  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = sampleValue(properties[key]);
  return out;
}

function sampleValue(property: Record<string, unknown> | undefined): unknown {
  if (!property) return null;
  if (Array.isArray(property['enum']) && property['enum'].length) return property['enum'][0];
  if ('const' in property) return property['const'];

  const type = Array.isArray(property['type']) ? property['type'][0] : property['type'];
  switch (type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return typeof property['minimum'] === 'number' ? property['minimum'] : 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return sampleArgs(property);
    default:
      return null;
  }
}

const TEMPLATE = `
<style>
  :host { all: initial; }
  .root[data-pos="inline"] { display: block; height: 100%; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .pill, .panel {
    position: fixed; z-index: 2147483647;
    color: #1c1c1e; background: #fff; border: 1px solid #d8d8d4;
    border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.16);
  }
  .root[data-pos="bottom-right"] .pill,
  .root[data-pos="bottom-right"] .panel { right: 16px; bottom: 16px; }
  .root[data-pos="bottom-left"]  .pill,
  .root[data-pos="bottom-left"]  .panel { left: 16px;  bottom: 16px; }
  .root[data-pos="top-right"]    .pill,
  .root[data-pos="top-right"]    .panel { right: 16px; top: 16px; }
  .root[data-pos="top-left"]     .pill,
  .root[data-pos="top-left"]     .panel { left: 16px;  top: 16px; }

  /* Docked: no fixed positioning, no shadow, fills the slot it was given. */
  .root[data-pos="inline"] .pill,
  .root[data-pos="inline"] .panel {
    position: static; box-shadow: none; border-radius: 0;
    border-width: 0; z-index: auto;
  }
  .root[data-pos="inline"] .panel {
    width: 100%; height: 100%; max-height: none;
  }
  .root[data-pos="inline"] .pill { margin: 12px; }

  .pill { padding: 7px 12px; font-size: 12px; cursor: pointer; }
  .panel { width: 380px; max-height: min(70vh, 640px); display: flex; flex-direction: column; }
  header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; border-bottom: 1px solid #ececea;
  }
  h2 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .01em; }
  .count {
    font-size: 11px; padding: 1px 7px; border-radius: 999px;
    background: #f0efec; font-variant-numeric: tabular-nums;
  }
  .status { font-size: 10.5px; margin-left: auto; }
  .status.ok { color: #2f7a55; } .status.warn { color: #9a6a12; } .status.bad { color: #b02525; }
  header button {
    border: 0; background: transparent; cursor: pointer; font-size: 13px;
    color: #76756f; padding: 2px 4px; line-height: 1;
  }
  header button:hover { color: #1c1c1e; }
  .body { overflow-y: auto; padding: 8px; }
  .tool { border-radius: 8px; margin-bottom: 4px; }
  .tool.open { background: #faf9f7; padding: 6px; }
  .tool-head {
    display: flex; align-items: baseline; gap: 6px; width: 100%;
    background: transparent; border: 0; cursor: pointer; text-align: left;
    padding: 5px 6px; font-size: 12px; color: inherit;
  }
  .tool-head:hover { background: #f3f2ef; border-radius: 6px; }
  .caret { color: #a3a29c; font-size: 9px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: #b4501f; }
  .desc {
    color: #76756f; font-size: 11px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .schema { margin: 4px 0 8px; font-size: 11px; }
  .schema summary { cursor: pointer; color: #76756f; }
  label { display: block; font-size: 10.5px; color: #76756f; margin-bottom: 3px; }
  textarea.args {
    width: 100%; min-height: 62px; font-family: ui-monospace, Menlo, monospace;
    font-size: 11.5px; padding: 7px; border: 1px solid #e0dfdb;
    border-radius: 6px; resize: vertical; background: #fff; color: inherit;
  }
  .run {
    margin-top: 6px; padding: 5px 13px; font-size: 11.5px; cursor: pointer;
    border: 1px solid #d8d8d4; border-radius: 6px; background: #fff; color: inherit;
  }
  .run:disabled { opacity: .45; cursor: not-allowed; }
  pre {
    margin: 6px 0 0; padding: 7px; background: #f3f2ef; border-radius: 6px;
    font-family: ui-monospace, Menlo, monospace; font-size: 11px;
    white-space: pre-wrap; word-break: break-word; max-height: 190px; overflow: auto;
  }
  .output.failed { background: #fbeaea; color: #8f1f1f; }
  .empty { color: #a3a29c; font-size: 11.5px; padding: 12px 6px; margin: 0; }
  .logwrap { border-top: 1px solid #ececea; padding: 8px; }
  .logwrap > strong { font-size: 10.5px; color: #76756f; font-weight: 500; }
  .entry { margin-top: 6px; font-size: 11px; }
  .entry time { color: #a3a29c; margin-left: 6px; font-size: 10px; }
  .entry.failed code { color: #b02525; }
  @media (prefers-color-scheme: dark) {
    .pill, .panel { color: #ececed; background: #202023; border-color: #37373d; }
    header { border-bottom-color: #2e2e34; }
    .count { background: #2c2c31; }
    .tool.open { background: #26262a; }
    .tool-head:hover { background: #2b2b30; }
    code { color: #e08b5e; }
    textarea.args { background: #1b1b1e; border-color: #37373d; }
    .run { background: #26262a; border-color: #37373d; }
    pre { background: #1b1b1e; }
    .output.failed { background: #2e2020; color: #e08585; }
    .logwrap { border-top-color: #2e2e34; }
  }
</style>
<div class="root">
<button class="pill" title="Ctrl/Cmd + Shift + M">🔌 WebMCP</button>
<section class="panel" hidden>
  <header>
    <h2>WebMCP tools</h2>
    <span class="count">0</span>
    <span class="status"></span>
    <button class="refresh" title="Refresh">⟳</button>
    <button class="close" title="Collapse">✕</button>
  </header>
  <div class="body"><div class="tools"></div></div>
  <div class="logwrap"><strong>Recent calls</strong><div class="log"></div></div>
</section>
</div>
`;
