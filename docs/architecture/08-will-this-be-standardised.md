[← the full sequence](./07-lifecycle-sequence.md) · [contents](./README.md)

# 8. Will WebMCP become a standard?

The honest answer is *probably not in the form it has today, and possibly never
outside Chromium.* This chapter lays out the evidence, because the question decides
how much of your app you should build on it.

Everything below is checkable — the sources are primary and the commands to re-run
them are at the bottom. Where a judgement is mine rather than a fact, it says so.

---

## First: "approved" is the wrong frame

WebMCP is a **W3C Community Group** draft, produced by the Web Machine Learning CG.

A CG report **cannot become a W3C Recommendation**. Community Groups are open,
low-ceremony venues with no standing to publish standards. For that, a chartered
**Working Group** has to adopt the work and take it through the Recommendation track.
Plenty of CG drafts never make that jump.

So the question isn't really "will it be ratified". Two things matter more:

1. **Will it ship in more than one engine?** Multi-engine support is what makes a web
   feature safe to build on, with or without a Recommendation.
2. **Will it stay stable?** A moving API is expensive whether or not it's a standard.

Both are answerable today.

---

## Where it actually stands

| Engine | Position | Source | Recorded |
|---|---|---|---|
| **Chromium** | implementing | origin trial from Chrome 149; full ship targeted ~Chrome 157 | ongoing |
| **Mozilla** | `position: neutral` | [standards-positions#1412](https://github.com/mozilla/standards-positions/issues/1412) | closed 2026-08-05 |
| **WebKit** | `position: oppose` | [standards-positions#670](https://github.com/WebKit/standards-positions/issues/670) | closed 2026-06-11 |

One engine shipping, one declining to commit, one formally against.

That is the least favourable shape a web feature can have short of being abandoned.
"Neutral" from Mozilla is not encouragement — it is the label for *we are not
objecting and not investing*.

### What WebKit actually objects to

Their issue carries eight `concerns:` labels:

```
duplication · internationalization · privacy · security
venue · use cases · portability · API design
```

plus topic labels including **meaningful user consent**.

Two of those are worth separating from the rest, because they are not the kind of
thing an editor fixes in a pull request:

**`venue`.** An objection to the *forum*: a Community Group with two vendors driving
it is not where a capability of this reach should be designed. That is a process
objection, and it is resolved only by moving the work — not by changing the spec.

**Meaningful user consent**, and the architectural argument underneath it: an agent
acting for a user is a kind of **assistive technology**, and a site should not be able
to detect that one is driving. Once "an agent is here" becomes observable, a site can
hand agents capabilities it withholds from its own interface — or withhold
capabilities from agents, which is the same lever pointed the other way.

WebMCP's entire premise is that a page *knowingly* offers a different, structured
surface to agents. You cannot satisfy that objection and keep the feature; they are
the same thing viewed from two sides.

That is a disagreement about what the web should be. Those do not get edited away.

---

## Scenarios

My judgement, not data. Reasoning included so you can disagree with it.

### A. Chromium-only de facto feature — *most likely*

Chrome ships it, Edge follows, Firefox and Safari don't. It becomes real and useful
on a majority of desktop browsers, never a standard, and stays a CG draft
indefinitely.

Plenty of the web works this way. It would not make WebMCP a bad bet — it would make
it a **Chromium** bet, which is a different risk to price.

### B. Working Group adoption and multi-engine support — *unlikely as things stand*

Requires WebKit's architectural objection to be resolved, and Mozilla to move from
neutral to investing. Neither looks close. A `venue` concern also implies the work
would have to move to a chartered WG first, which is itself slow.

Not impossible: web features have recovered from a single oppose before, usually by
being **redesigned around** the objection rather than defended.

### C. Reshaped into something meaningfully different — *plausible*

The objection points at a specific design: sites declaring tools *to agents they can
detect*. A version where the user agent mediates — where a site cannot tell an agent
from a person, and the agent derives tools from ordinary markup — would answer WebKit
while losing much of what makes WebMCP attractive to app authors.

If that happens, today's `document.modelContext` is a stepping stone, and code
written against it needs porting.

### D. Stalls or is withdrawn — *possible, not likely soon*

Google has shipped it and Microsoft co-authored it. Withdrawal would take a change of
strategy, not a change of spec. More likely it simply persists as A.

---

## It has already moved twice

Worth weighing alongside the positions, because instability is a cost you pay now
rather than a risk you might pay later:

| Change | Effect |
|---|---|
| `navigator.modelContext` → `document.modelContext` | Chrome 150 deprecated the original spelling |
| `inputSchema`: JSON string → object ([webmcp#241]) | rolling out from Chrome 154.0.8013; 149–153 still return the string |

Both landed inside a single year, on a feature still in origin trial. And the
explainer's own open questions — multimodal I/O, streaming, navigation during a call,
output schemas — are not small.

See [chapter 6](./06-what-bites-you.md) for what those changes cost in practice.

---

## What would change the picture

Concrete, checkable signals, roughly in order of how much they'd move my judgement:

- **WebKit moves off `oppose`**, or the `venue` concern is answered by the work moving
  to a chartered Working Group.
- **Mozilla moves off neutral** in either direction.
- **A TAG review** landing with substantive design feedback that the editors adopt.
- **Chrome 157 ships on schedule** — or slips, which would suggest the design is still
  in flux.
- **A second engine starts an implementation**, even behind a flag. This is the single
  strongest signal and currently absent.

---

## What this means for this package

Less than you might expect, because the design does not depend on the outcome.

**We were never betting on standardisation.** The library runs on Chromium *plus the
polyfill*, and the polyfill works in Firefox and Safari today. In scenario A,
`installWebMcpPolyfill()` simply stays in `main.ts` permanently instead of being
deleted one day. Nothing breaks.

**`/bridge` is the part that ages best.** It speaks MCP over JSON-RPC to agents that
already exist — Claude Desktop, Cursor, extensions — and does not depend on the W3C
draft being adopted at all. If WebMCP stalls, that entry point still earns its keep.

**The core surface is the exposed part.** It mirrors `@angular/core` v22, which mirrors
the draft. If the draft is redesigned (scenario C), Angular changes, and this package
changes with it — which is exactly why the parity suite runs weekly and why this is
`0.x`.

**Practical advice unchanged:** pin the version, keep tools thin wrappers over
services that know nothing about WebMCP ([guide chapter 2](../guide/02-writing-tools.md)),
and you can walk away from the whole layer without touching your app's logic. That
separation was worth having for its own sake; it also happens to be the hedge.

---

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

**Accurate as of 16 September 2026.** If you are reading this much later, run the
commands — a single change in the WebKit row would rewrite most of this chapter.

[webmcp#241]: https://github.com/webmachinelearning/webmcp

---

[← back to contents](./README.md)
