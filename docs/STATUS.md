# Status and open threads

Working state, for picking the project up. Updated 16 September 2026.

For *what the package is*, read the [README](../README.md). For *how to use it*, the
[guide](./guide/README.md). For *how WebMCP works*, the
[architecture course](./architecture/README.md). This file is only the state of play.

---

## The three repos

| | |
|---|---|
| `~/myGitHub/webmcp-angular` | the library. Angular workspace, 6 entry points + schematics |
| `~/myGitHub/webmcp-angular-playground` | sample app: tic-tac-toe an agent plays, page-scoped tools, chat, inspector |
| `~/myGitHub/claude-openai-proxy` | fronts the local Claude Code login so the playground chat works with no API key |

They are separate on purpose: the playground installs the **built tarball**, not
workspace source, so it exercises what actually ships (`docs/M0-FINDINGS.md` §6.1 for
the bug that caught).

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

Milestones **M0–M9 are complete or settled** (`docs/PLAN.md` §6). Not done: `ng add`,
a docs site, publish prep (LICENSE, `repository` field).

## Running the demo end to end

```bash
# 1. proxy — gives the chat an LLM without an API key
cd ~/myGitHub/claude-openai-proxy
PROXY_API_KEY=my-secret-key PORT=8080 PERSIST_SESSIONS=1 npm start

# 2. playground
cd ~/myGitHub/webmcp-angular-playground && npm start     # http://localhost:4200
```

In the chat panel: **API URL** `http://127.0.0.1:8080`, **key** `my-secret-key`.
Then try *"what's on the board?"*, or tick **Agent plays back** and click a square.
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

### 1. Tools on/off toggle in the chat — designed, not built

Discussed in detail, documented in
[chapter 7](./architecture/07-lifecycle-sequence.md#cadence-when-you-control-the-agent),
**not implemented**. Two things move with the toggle: the `tools` key *and* the
system prompt (a tool-aware prompt with tools off makes the model narrate calls it
never made). Registration is unaffected — the toggle governs what the chat sends, not
what the page publishes.

Recommended: toggle starts a new session. Alternative: keep the conversation and send
`tools` with `tool_choice: {type: 'none'}` when history already holds tool blocks.

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

### 4. Nobody watches the parity cron

`.github/workflows/parity.yml` runs weekly to catch Angular changing its experimental
WebMCP API out from under the backport — which they explicitly reserve the right to
do. Decide who gets told when it goes red. This is the main ongoing risk.

### 5. Untested surfaces

- **Firefox and Safari.** The unsupported path is proven in jsdom with `modelContext`
  removed — same code path, but no real non-Chromium browser has run it.
- **Native Chrome WebMCP.** Everything browser-side so far is polyfill-backed.
  `--enable-features=WebMCP` would exercise the real implementation, including
  whether `inputSchema` arrives as a string on that build (FR-3.5's string arm is
  covered only by unit test).
- **Hydration ordering.** The SSR fixture prerenders and reports unsupported
  server-side; nothing asserts tools *do* register on the client after hydration.

---

## Things that cost real time, worth not rediscovering

Full detail with evidence in [`M0-FINDINGS.md`](./M0-FINDINGS.md); the ones that bite
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
- **Route-level `providers` leak** before Angular 22 — measured, not assumed.
- **jsdom cannot test anything** that depends on where an event fires, or on
  `event.origin` / `event.source`.
