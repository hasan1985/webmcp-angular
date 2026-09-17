[← the external agent](./08-lifecycle-external-agent.md) · [contents](./README.md) · next: [Inside the polyfill →](./10-inside-the-polyfill.md)

# 9. Will this be standardised?

This package follows the W3C WebMCP draft, through the API Angular 22 built on it.
The draft is a proposal, not an approved standard. We follow it anyway, for one
reason: if it is adopted, the code you write today already has the right shape and
the move to whatever ships is small. If it is not, the polyfill keeps that same code
working. Either way your app logic sits behind thin tools and is untouched.

This chapter is the evidence behind that bet, so you can weigh it yourself.

---

## What "draft" means here

WebMCP is published by the W3C Web Machine Learning **Community Group**. Community
Groups incubate ideas; they cannot publish a W3C Recommendation. For that, a chartered
**Working Group** adopts the work and takes it through the Recommendation track. Many
CG drafts stay drafts.

So the practical questions are: does it ship in more than one browser engine, and does
its shape hold still? Both are answerable today.

## Where the engines stand

| Engine | Position | Source | Recorded |
|---|---|---|---|
| **Chromium** | implementing | origin trial from Chrome 149; full ship targeted ~Chrome 157 | ongoing |
| **Mozilla** | `position: neutral` | [standards-positions#1412](https://github.com/mozilla/standards-positions/issues/1412) | closed 2026-08-05 |
| **WebKit** | `position: oppose` | [standards-positions#670](https://github.com/WebKit/standards-positions/issues/670) | closed 2026-06-11 |

One engine shipping, one not investing, one formally against.

WebKit's issue carries eight `concerns:` labels — duplication, internationalization,
privacy, security, venue, use cases, portability, API design — and the topic
*meaningful user consent*. Two of them are about the premise rather than the details:
`venue` says a Community Group is the wrong forum for a capability of this reach, and
the consent argument says a site should not be able to tell that an agent is acting
for a user, whereas WebMCP exists so that a page can *knowingly* offer agents a
structured surface. Those are resolved by moving or redesigning the work, not by
editing it.

## What could happen, and what it changes for you

| Outcome | Likelihood, as we read it | What changes in an app built on this package |
|---|---|---|
| Chromium ships it; Firefox and Safari stay out | most likely | nothing — `installWebMcpPolyfill()` stays in `main.ts` for the other engines |
| Redesigned around WebKit's objection, then adopted more widely | plausible | the core surface is re-shaped; Angular follows, this package follows Angular, your tools port |
| Adopted as-is by a Working Group with multi-engine support | unlikely as things stand | the smallest move of all — the shape you have is the shape that ships |
| Stalls | possible, not soon | the polyfill and `/bridge` keep working; nothing to do |

Signals that would move that reading, strongest first: a second engine starting an
implementation, even behind a flag; WebKit moving off `oppose` or the work moving to
a Working Group; Mozilla moving off neutral; Chrome 157 shipping on schedule, or
slipping.

## It has already moved three times

| Change | Effect |
|---|---|
| `navigator.modelContext` → `document.modelContext` | Chrome 150 deprecated the original spelling |
| `inputSchema`: JSON string → object ([webmcp#241]) | rolling out from Chrome 154.0.8013, cross-document tools first; origin-trial builds still return the string for same-document tools |
| `executeTool`: Chromium extension → draft interface | the draft takes an argument **object**; Chrome, the polyfill and types 5.1.0 still take a JSON string |

All three inside a single year, on a feature still in origin trial. The explainer's
open questions — multimodal I/O, streaming, navigation during a call, output schemas —
are not small either. [Chapter 6](./06-what-bites-you.md) is what these cost in
practice; the adapter absorbs each one so your tools see a single shape.

### The discovery gap

The draft describes registration and reading, then treats "an agent connected to the
page" as given. For the browser's own agent that holds — it takes an observation of
the tab and owns the registry. For an agent from outside the browser, three things are
missing:

- **Finding the page.** No meta tag, header, manifest or well-known URL says "this
  page has tools"; an external agent learns of them only by running code inside the
  page. MCP has the same runtime hole and an out-of-band answer — host configuration
  and the registry. WebMCP's only out-of-band answer is navigation.
- **Knowing it is welcome.** `exposedTo` scopes by origin, not by kind of agent, and
  with the polyfill installed `document.modelContext` exists on every page that
  included it. This one is by design: the draft declines to let a page tell agents
  apart, which is WebKit's objection viewed from the other side.
- **Hearing an announcement.** A page can `postMessage` only into its own window, so
  the bridge's `mcp-server-ready` reaches a client that already knows to probe on that
  channel — which is the first point again.

What ships today is an extension the user installs, a content script it injects, and
the `@mcp-b/transports` handshake ([chapter 8, diagram 2](./08-lifecycle-external-agent.md#2-the-agent-arrives-and-a-session-starts)).
If you only *expose* tools, none of this costs you anything. If you are building an
external agent, budget for the extension and the probe; a page-side beacon helps only
once agents agree to listen for it, and no such agreement exists.

## How the package is built for this

- **The core surface mirrors `@angular/core` v22**, which mirrors the draft. A weekly
  parity run compares the two, so when Angular moves with the draft this package
  moves with Angular, and the change reaches you as a version bump rather than a
  rewrite. That is also why this is `0.x`.
- **The polyfill is the floor.** Firefox and Safari run the same code today; a
  Chromium-only outcome changes nothing.
- **`/bridge` speaks MCP over JSON-RPC** to agents that exist now — Claude Desktop,
  Cursor, extensions — independent of the draft's fate.
- **Your tools are thin wrappers** over services that know nothing about WebMCP
  ([guide chapter 2](../guide/02-writing-tools.md)). Whatever the outcome, that
  boundary is where the change stops.

Pin the version, keep tools thin, and the whole layer stays swappable.

## Re-checking this yourself

The positions are machine-readable. These are the exact sources behind the table
above:

```bash
# WebKit — canonical position data
curl -s https://raw.githubusercontent.com/WebKit/standards-positions/main/summary.json \
  | python3 -c "import sys,json;print([x for x in json.load(sys.stdin) if x['title']=='WebMCP'])"

# Either vendor — labels carry the position
curl -s https://api.github.com/repos/WebKit/standards-positions/issues/670 \
  | python3 -c "import sys,json;print([l['name'] for l in json.load(sys.stdin)['labels']])"
curl -s https://api.github.com/repos/mozilla/standards-positions/issues/1412 \
  | python3 -c "import sys,json;print([l['name'] for l in json.load(sys.stdin)['labels']])"
```

Spec and explainer: <https://webmachinelearning.github.io/webmcp/> ·
<https://github.com/webmachinelearning/webmcp>

**Accurate as of 16 September 2026.** A single change in the WebKit row would rewrite
most of this chapter.

[webmcp#241]: https://github.com/webmachinelearning/webmcp/pull/241

---

next: [Inside the polyfill →](./10-inside-the-polyfill.md)

[← back to contents](./README.md)
