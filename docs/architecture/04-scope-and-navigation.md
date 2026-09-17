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
  provideWebMcpTools([getBoardTool]),
]
```

Registered when the app bootstraps, unregistered when the root injector is destroyed
(i.e. never, in practice). Use for genuinely global capabilities.

### Component scope — the component's injector

```ts
@Component({...})
export class NotesPage {
  constructor() {
    declareWebMcpTool({
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
  providers: [provideWebMcpTools([addNoteTool])],   // ⚠️
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

The router fixes this with an opt-in feature:

```ts
provideRouter(routes, withExperimentalAutoCleanupInjectors())
```

which destroys route-level environment injectors on navigation. `@angular/router`
ships it from **21.1.0** — absent in 20.x and 21.0, present in 21.1, 21.2 and 22
(verified against the published packages). It cannot be recreated for an older
router: `RouterFeatureKind` is a numeric enum and the router only acts on kinds it
knows.

### What to do instead

Declare route-scoped tools **in the routed component**:

```ts
@Component({...})
export class NotesPage {
  constructor() {
    declareWebMcpTool({ /* … */ });   // dies with the component
  }
}
```

The component is created and destroyed by the router already, so its lifetime is the
route's lifetime in every version that matters. You lose nothing.

```
                 route providers                    component constructor
                 ──────────────                     ─────────────────────
   20.x, 21.0    ✗ leaks on navigation              ✓ cleans up
   21.1+, 22     ✓ with withExperimental…()          ✓ cleans up
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
    declareWebMcpTool({
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

## Cross-origin: `exposedTo`

`registerTool`'s second option is for pages made of more than one document. A tool
is visible to the document that registered it. `exposedTo` opens it to other documents
in the same tab — a parent page reading tools out of an embedded widget, or the other
way round:

```ts
declareWebMcpTool(tool);   // Angular passes {signal} only — visible to this document

document.modelContext.registerTool(tool, {
  signal,
  exposedTo: ['https://shop.example'],   // that document may list and call it too
});
```

Origins must be potentially trustworthy (`https:`, or localhost), or registration
rejects with `SecurityError`. Access to the API inside a frame is also gated by the
`tools` permissions policy, whose default allowlist is `'self'` — a cross-origin
`<iframe>` needs `allow="tools"` before its own `document.modelContext` does anything.

`declareWebMcpTool` sets `signal` and nothing else, so for a cross-origin tool call
`registerTool` yourself and wire the `DestroyRef → AbortController` chain from
[chapter 2](./02-the-lifecycle.md) by hand.

### Which agent this concerns

`exposedTo` scopes by **document**, and it matters only when a tab holds more than
one:

| Agent | Meets `exposedTo` when |
|---|---|
| **Browser's own agent** | always, in a multi-frame tab — its observation covers every frame, and the option decides which frames' tools it may pass to a caller |
| **In-page agent** | its chat runs in one frame and the tool was registered in another — the parent calls `getTools({fromOrigins: [...]})` and sees only tools exposed to it |
| **External agent** | never through the bridge — the bridge reads the one document it runs in, with no `fromOrigins`, and a frame's tools are reached by a bridge in that frame |

So it says which *documents* may see a tool. Which *agents* may is a different
question, and one the draft leaves alone —
[chapter 9](./09-will-this-be-standardised.md#the-discovery-gap) takes it up.

Under the polyfill both options are rejected with `NotSupportedError`
([chapter 10](./10-inside-the-polyfill.md#registertool)); cross-document tools are
native-only today.

## Observing changes

Every registration and unregistration fires a `toolchange` event **at the
ModelContext object**, so a panel or a connected client can stay current:

```ts
document.modelContext.addEventListener('toolchange', () => refreshToolList());
// or: document.modelContext.ontoolchange = () => refreshToolList();
```

The target is the `ModelContext`, not the document — that is where the draft fires it
and where `@mcp-b/webmcp-polyfill` fires it. This project first listened on the
document and heard nothing; the story is [chapter 6](./06-what-bites-you.md) §7. The
library's own listeners now attach to both targets, so a document-level dispatch, should
an implementation add one, is heard as well.

---

next: [Getting tools out of the page →](./05-transports.md)
