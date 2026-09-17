[← external agents](./06-external-agents.md) · [contents](./README.md) · next: [Migrating to Angular 22 →](./08-migrating-to-angular-22.md)

# 7. Inspecting

An optional entry point for seeing your tools while you build — and exercising them
without an agent, an API key, or a chat window.

## The inspector

```ts
// main.ts
import { isDevMode } from '@angular/core';

if (isDevMode()) {
  const { mountWebMcpDevtools } = await import('webmcp-angular/devtools');
  mountWebMcpDevtools();     // Ctrl/Cmd + Shift + M
}
```

A floating panel listing every tool the page currently exposes, with its schema,
arguments prefilled from that schema, a Run button, and a log of recent calls. You can
exercise a tool without an agent, an API key, or a chat window.

The tool list is live — navigate around and watch it change, which is the quickest way
to confirm your [scoping](./03-scoping-tools.md) does what you meant.

### Keep it out of your bundle

**Use a dynamic import.** That's what puts it in its own lazy chunk. Measured on a
production Angular build: ~8.6 kB raw, ~3 kB transfer, emitted to disk but **never
downloaded**, because `isDevMode()` is false and the import never runs. A *static*
import pulls the same code into `main.js` unconditionally.

If you need it gone from disk entirely, guard the call site with your own build flag
so the bundler can drop the branch.

### Placing it

It floats bottom-right by default, which is where apps tend to put chat widgets and
support bubbles. Move it, or dock it into your own layout:

```ts
mountWebMcpDevtools({ position: 'bottom-left' });

// or as a real panel in a slot you control
mountWebMcpDevtools({ position: 'inline', container: document.getElementById('slot')! });
```

`'inline'` drops the fixed positioning so the panel flows inside its container as an
ordinary block, and starts open — a docked panel collapsed to a pill would leave a
hole in your layout.

It renders in a shadow root, so your styles can't reach it and its styles can't reach
your app.

| Option | |
|---|---|
| `position` | `'bottom-right'` (default), `'bottom-left'`, `'top-right'`, `'top-left'`, `'inline'` |
| `container` | where to attach; defaults to `document.body` |
| `open` | start expanded; defaults to `true` for `'inline'`, `false` otherwise |
| `shortcut` | `false` to disable Ctrl/Cmd + Shift + M |

Returns `{ open(), close(), refresh(), destroy() }`.

---

next: [Migrating to Angular 22 →](./08-migrating-to-angular-22.md)
