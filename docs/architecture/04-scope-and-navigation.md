[← anatomy of a call](./03-anatomy-of-a-call.md) · [contents](./README.md) · next: [Getting tools out of the page →](./05-transports.md)

# 4. Scope and navigation

A tool's lifetime is the lifetime of the injector it was attached to
([chapter 2](./02-the-lifecycle.md)). So "scoping a tool" is really just "choosing an
injector". This chapter is about which one to choose — and about the choice that
looks right and is not.

## Why scoping matters at all

It is tempting to register everything at the root and be done. Two reasons not to:

**Context cost.** Every tool's name, description and schema is sent to the model on
every turn. Fifty always-on tools is a real token bill on every request, forever.

**Accuracy.** A model choosing between 6 relevant tools does better than one choosing
between 50, most of which cannot apply on the current page. Irrelevant options are
not free — they are distractors.

The ideal: the agent sees the tools that make sense *here, now*.

```
   /game                          /notes
   ┌─────────────────┐            ┌─────────────────┐
   │ get_board       │            │ get_board       │  ← app-scoped, always there
   │ make_move       │            │ make_move       │
   │ reset_game      │            │ reset_game      │
   └─────────────────┘            │ list_notes      │  ← page-scoped, only here
                                  │ add_note        │
                                  └─────────────────┘
        3 tools                        5 tools
```

## The three scopes

### App scope — the root injector

```ts
// app.config.ts
providers: [
  provideExperimentalWebMcpTools([getBoardTool]),
]
```

Registered when the app bootstraps, unregistered when the root injector is destroyed
(i.e. never, in practice). Use for genuinely global capabilities.

### Component scope — the component's injector

```ts
@Component({...})
export class NotesPage {
  constructor() {
    declareExperimentalWebMcpTool({
      name: 'add_note',
      description: 'Add a note. Only available while the notes page is open.',
      inputSchema: {type: 'object', properties: {text: {type: 'string'}}, required: ['text']},
      execute: ({text}) => inject(NotesStore).add(text),
    });
  }
}
```

Registered when the component is created, unregistered when it is destroyed. This is
the workhorse, and it behaves correctly on every Angular version.

### Service scope — the service's injector

Same call, in a service constructor. Lifetime is the service's: a `providedIn: 'root'`
service means app scope; a service provided by a component means component scope.

## The trap: route-level providers

This looks like the obvious way to scope a tool to a route:

```ts
{
  path: 'notes',
  providers: [provideExperimentalWebMcpTools([addNoteTool])],   // ⚠️
  loadComponent: () => import('./notes.page').then(m => m.NotesPage),
}
```

**On Angular 20 and 21 this leaks.** The route's environment injector is not destroyed
when you navigate away, so the tool stays registered forever.

Measured in Chrome on Angular 20.3.31, with a probe route registering `probe_leak`:

```
   /game              →  get_board, make_move, reset_game
   /leak              →  + probe_leak
   back to /game      →  probe_leak STILL PRESENT        ← leaked
   /notes             →  + add_note, list_notes
   back to /game      →  add_note, list_notes gone       ← component scope is fine
```

Angular 22 fixes this with a router feature:

```ts
provideRouter(routes, withExperimentalAutoCleanupInjectors())
```

which destroys route-level environment injectors on navigation. It cannot be
backported — `RouterFeatureKind` is a numeric enum and the value is a v22 addition, so
a v20 router cannot be handed a valid feature object.

### What to do instead

Declare route-scoped tools **in the routed component**:

```ts
@Component({...})
export class NotesPage {
  constructor() {
    declareExperimentalWebMcpTool({ /* … */ });   // dies with the component
  }
}
```

The component is created and destroyed by the router already, so its lifetime is the
route's lifetime in every version that matters. You lose nothing.

```
            route providers                    component constructor
            ──────────────                     ─────────────────────
   v20/21   ✗ leaks on navigation              ✓ cleans up
   v22      ✓ with withExperimental…()          ✓ cleans up
                                                ↑ works everywhere, choose this
```

## Conditional tools

Sometimes a tool should exist only in a particular *state*, not on a particular page —
only when logged in, only while a dialog is open. There is no `enabled` flag in the
API, so use an injector you control:

```ts
@Component({...})
export class CheckoutDialog {
  constructor() {
    // The dialog's own injector is destroyed when the dialog closes,
    // so the tool disappears with it.
    declareExperimentalWebMcpTool({
      name: 'confirm_payment',
      description: 'Confirm the pending payment. Only valid while checkout is open.',
      inputSchema: {type: 'object', properties: {}},
      execute: () => inject(CheckoutService).confirm(),
    });
  }
}
```

The general move: **find the thing whose lifetime you actually mean, and attach
there.** If nothing has that lifetime, create an injector that does.

## Observing changes

Every registration and unregistration fires a `toolchange` event, so a panel or a
connected client can stay current:

```ts
document.addEventListener('toolchange', () => refreshToolList());
```

⚠️ With one large caveat — `@mcp-b/webmcp-polyfill` dispatches `toolchange` **only on
the ModelContext object**, never on the document. Listen to both, or your listener
will never fire on a polyfilled page:

```ts
document.addEventListener('toolchange', handler);
document.modelContext?.addEventListener?.('toolchange', handler);
```

That one is measured, and cost a real bug. It is [chapter 6](./06-what-bites-you.md) §8.

---

next: [Getting tools out of the page →](./05-transports.md)
