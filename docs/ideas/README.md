# Ideas

Things this package could do next. Each one is a design sketch, not a plan: the
problem, the ways it could be built, which way fits the architecture, and what it
would cost. When one is taken up it becomes a [decision record](../decisions/README.md);
until then it lives here so the thinking is not lost.

Every idea has to pass the same test as everything else in this package: **it must
not touch the core entry point.** The core mirrors `@angular/core`, and the whole
design rests on that staying true ([decision 001](../decisions/001-mirror-angular-not-invent.md)).
New capability goes in a new entry point, and it has to work the same after an app
switches to Angular's native API.

| # | Idea | In one line |
|---|---|---|
| [01](./01-external-mcp-server.md) | Tools from an external MCP server | mirror a remote server's tools into `document.modelContext` so every agent sees them |
| [02](./02-workflows.md) | Workflows instead of a flat list | a workflow is a state machine whose current state decides which tools are registered |

## Format

1. **The idea** — what someone would be able to do.
2. **What exists today** — the nearest thing already in the package or the draft.
3. **Ways to build it** — with the trade-offs.
4. **The way that fits** — and why.
5. **What it would cost** — dependencies, tokens, security, docs.
6. **Open questions** — what would need answering before starting.
