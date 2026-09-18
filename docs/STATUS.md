# Status and open threads

Working state, for picking the project up. Updated 16 September 2026.

For *what the package is*, read the [README](../README.md). For *how to use it*, the
[guide](./guide/README.md). For *how WebMCP works*, the
[architecture course](./architecture/README.md). For *how the polyfill works*, read
from source, [`docs/polyfill/`](./polyfill/README.md). For *why each choice was made*
and the evidence behind it, [`docs/decisions/`](./decisions/README.md). For *what might
come next*,
[`docs/ideas/`](./ideas/README.md). This file is only the state of play.

---

## The three repos

| | |
|---|---|
| `~/myGitHub/webmcp-angular` | the library. Angular workspace, 6 entry points + schematics |
| `~/myGitHub/webmcp-angular-playground` | sample app: tic-tac-toe an agent plays, page-scoped tools, chat, inspector |
| `~/myGitHub/claude-openai-proxy` | fronts the local Claude Code login so the playground chat works with no API key |

They are separate on purpose: the playground installs the **built tarball**, not
workspace source, so it exercises what actually ships ([evidence 4.1](./decisions/evidence.md)
for the bug that caught).

## Current state

```
✔ 127 tests green      ✔ .d.ts parity with @angular/core@22.1.6
✔ packaging + SSR prerender check passes
✔ verified in Chrome: registration, execution, navigation scoping, bridge, devtools
```

```bash
npm run verify           # everything: api-diff, specs on Angular 20/21/22, SSR, packaging
npm run build:lib        # all entry points + schematics → dist/
npm run check:packaging  # pack, install the tarball in a real SSR app, prerender
```

All planned milestones are complete or settled — core, parity suite, SSR/polyfill,
migrate schematic, `/testing`, `/bridge`, `/devtools`. Architecture docs reviewed
against the current draft 16 September 2026 (open threads 3 and 4 came out of it). Not done: `ng add`,
a docs site, publish prep (LICENSE, `repository` field).

## Running the demo end to end

```bash
# 1. proxy — gives the chat an LLM without an API key
cd ~/myGitHub/claude-openai-proxy
PROXY_API_KEY=my-secret-key PORT=8080 PERSIST_SESSIONS=1 npm start

# 2. playground
cd ~/myGitHub/webmcp-angular-playground && npm start     # http://localhost:4200
```

In the chat panel: **API URL** `http://127.0.0.1:8080`, **key** `my-secret-key`. Both
live in that tab's `sessionStorage` — a new tab starts blank. **Connect** probes
`GET /v1/models` first, so a wrong key or a blank URL fails on the form with the
reason, and success shows *connected to 127.0.0.1:8080* under the header.
Ask *"what's on the board?"* once, click **Enable WebMCP**, and ask again — or tick
**Agent plays back** and click a square. The JSON-RPC bridge is **off** until you tick
**External agents** in the header (thread 7).
**Ctrl/Cmd + Shift + M** opens the inspector.

After rebuilding the library, reinstall it in the playground:

```bash
cd ~/myGitHub/webmcp-angular/dist/webmcp-angular && npm pack --pack-destination /tmp
cd ~/myGitHub/webmcp-angular-playground && npm i /tmp/webmcp-angular-0.0.1.tgz
rm -rf .angular/cache     # ← ng serve caches pre-bundled deps; stale after a rename
```

That last line is not optional after an API rename. `ng build` is fine; `ng serve`
serves a stale Vite dep cache and fails with *"does not provide an export named…"*.

---

## Open threads

### 1. Tools on/off toggle in the chat — built

**Enable WebMCP** button in the chat panel, off by default. Implemented as designed in
[chapter 7](./architecture/07-lifecycle-in-page-agent.md#cadence-when-you-control-the-agent):
off = no `tools` key (omitted, not `[]`), plain system prompt, no app-context read, no
`getTools()` call; the switch starts a new session so the two modes never share a
history. Registration is unaffected — the inspector still lists the tools. "Agent
plays back" is disabled while off. State lives in `AgentTurn.webMcpEnabled`.

Verified in Chrome via the proxy: off → request has no `tools`, model answers "I can't
see the page"; on → `tools: [4]`, `get_board` runs, model reads the board.

### 2. Per-session app context — half built

`about_this_app` tool exists in the playground (`src/app/app-context.tool.ts`) and the
chat reads it once per session into the system prompt. **Verified the economics** —
94 chars in `tools/list` every turn, 989 chars fetched once — but the end-to-end
session behaviour was not re-tested after the last edit. Check that it is read once
per session and re-read after **New chat**.

### 3. The bridge may not interoperate with a 2026-07-28 MCP client

Our `/bridge` implements `initialize` and advertises `PROTOCOL_VERSION =
'2025-11-25'`. The current MCP spec replaced that handshake: it is stateless, carries
version and capabilities in `_meta` per request, and servers **must** implement
`server/discover`. A current client calling `server/discover` gets `methodNotFound`
from us. Notifications are also now opt-in via `subscriptions/listen`, where we push
`list_changed` unconditionally.

Not yet fixed. Adding `server/discover` plus subscription handling would restore
interop without breaking older clients.

### 4. `executeTool` argument shape — the draft moved, we follow the polyfill

Verified 16 September 2026 against the current draft: `executeTool` is now on the
`ModelContext` interface itself and takes an argument **object**. Chrome's origin
trial, `@mcp-b/webmcp-polyfill` 5.1.0 (`parseChromeToolInput`) and
`@mcp-b/webmcp-types` 5.1.0 still take a **JSON string**, and the bridge and devtools
pass a string. That is correct for everything runnable today. When a build ships the
draft's shape, the bridge (`bridge/src/public-api.ts`) and devtools each have one call
site to change; worth a feature-probe rather than a version check.

Same pass: the draft fires `toolchange` at the **ModelContext**, not the document —
so the polyfill was right and our original document-only listener was the bug.
Architecture chapters 4, 6 §7 and 7 now say so; the listen-on-both code is fine as a
hedge.

### 5. Nobody watches the parity cron

`.github/workflows/parity.yml` runs weekly to catch Angular changing its experimental
WebMCP API out from under the backport — which they explicitly reserve the right to
do. Decide who gets told when it goes red. This is the main ongoing risk.

### 6. Untested surfaces

- **Firefox and Safari.** The unsupported path is proven in jsdom with `modelContext`
  removed — same code path, but no real non-Chromium browser has run it.
- **Native Chrome WebMCP.** Everything browser-side so far is polyfill-backed.
  `--enable-features=WebMCP` would exercise the real implementation, including
  whether `inputSchema` arrives as a string on that build (FR-3.5's string arm is
  covered only by unit test).
- **Hydration ordering.** The SSR fixture prerenders and reports unsupported
  server-side; nothing asserts tools *do* register on the client after hydration.

---

### 7. Chat polish — done 18 September 2026

Streaming (adaptive: tries `messages.stream()`, learns per session when an endpoint
answers 400 — the proxy does), a growing bubble with a cursor, smart auto-scroll with
a "↓ new messages" pill, a safe markdown renderer, a growing textarea (Enter sends,
Shift+Enter newline), and a Stop button. Verified in Chrome against the proxy; the
streaming render itself is covered by `agent.spec.ts` through the real SDK with a
fake SSE `fetch`, since the proxy cannot stream. No chat library: nothing maintained
exists for Angular, and Deep Chat (the one web-component option) owns the loop and
weighs 387 kB.

### 8. Bridge is opt-in — verify the stop path with a real client

Built 16 September 2026: `ExternalAgents` service, header checkbox, lazy import,
`start()`/`stop()`. Verified in Chrome: fresh load is off with no bridge chunk
requested; enabling fetches the chunk and a hand-posted `mcp-check-ready` gets
`mcp-server-ready`; disabling announces `mcp-server-stopped` and the probe goes
unanswered; the choice survives reload via `localStorage`. Not yet verified with a
real client: that the MCP-B extension disconnects cleanly on `mcp-server-stopped`.

## Things that cost real time, worth not rediscovering

Full detail in [`decisions/evidence.md`](./decisions/evidence.md); the ones that bite
most often:

- **A fake more capable than reality hides bugs.** The test harness dispatched
  `toolchange` on both the document and the model context (spec-faithful). The
  polyfill dispatches only on the context. 20 green tests, and the bridge silently
  never notified in a real browser.
- **Curl tests hide CORS bugs.** A fixed `Access-Control-Allow-Headers` list passes
  every curl preflight — because curl only asks for the headers you thought of — then
  fails in a browser, which asks for `x-stainless-*` too. Echo the request header.
- **`file:` installs symlink**, and TypeScript resolves symlinks to their real path,
  so a secondary entry point importing the primary by package name degrades to `any`
  under `skipLibCheck`. Test against a packed tarball.
- **The polyfill's cleanup restores only what it installed.** A `modelContext` that
  was already on `document` (the test harness's, an earlier spec's) is skipped at
  install and survives `cleanupWebMCPPolyfill()`; clear both `document` and
  `Document.prototype` in teardown. Detail: `docs/polyfill/01-install-and-cleanup.md`.
- **Route-level `providers` leak** unless `withExperimentalAutoCleanupInjectors()` is on,
  and that feature only exists from `@angular/router` 21.1 — measured on 20.3.31.
- **jsdom cannot test anything** that depends on where an event fires, or on
  `event.origin` / `event.source`.
