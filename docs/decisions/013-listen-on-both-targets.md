# 013 · Listen for `toolchange` on the context and on the document

**Status:** settled · **Date:** September 2026 (measured); reasoning corrected 16 September 2026

## Situation

The bridge's `list_changed` notification never fired in Chrome — the tool list
changed on navigation and no connected client heard it. 20 tests were green.

## What was happening

The bridge listened on `document`. The polyfill dispatches `toolchange` on the
`ModelContext` object. Measured across four route changes: document listener 0 calls,
context listener 4. The tests missed it because the test harness fake dispatched on
**both** targets — a fake more capable than reality hides exactly this class of bug.

The original write-up said "the spec dispatches on the document, the polyfill is
wrong". Reading the draft later showed the opposite: the draft fires the event at the
document's `ModelContext`, `ontoolchange` is an attribute of that interface, and the
polyfill was right all along.

## Options

| | |
|---|---|
| Listen on the context only | correct per the draft and the polyfill |
| **Listen on both** | correct today, and free insurance against an implementation that also dispatches on the document; costs one `addEventListener` |
| Make the harness fake dispatch only on the context | more faithful; but then a consumer who listens on the document alone passes no test at all, which is the worse outcome |

## Decision

Bridge and devtools attach to both. The harness keeps firing on both, with a note in
the guide that this makes it more generous than a browser. A regression test
dispatches on the context *only* and asserts the bridge notifies.

## What it cost

A listener that never fires, and one paragraph of explanation wherever the pattern
appears. The corrected reasoning had to be propagated to six documents.

## Revisit when

Never for the code. For the docs: if a browser ever dispatches on the document, the
"hedge" becomes the reason.
