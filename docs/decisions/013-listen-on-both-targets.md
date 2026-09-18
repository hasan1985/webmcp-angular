# 013 · Listen for `toolchange` on the context and on the document

**Status:** settled · **Date:** September 2026 (measured); reasoning corrected 16 September 2026

## Situation

The bridge's `list_changed` never fired in Chrome while 20 tests were green. The bridge
listened on `document`; the polyfill dispatches on the `ModelContext`. Measured over
four route changes: document listener 0 calls, context listener 4. The test fake fired
on **both** targets — a fake more capable than reality hides this class of bug.

The original write-up said the spec dispatches on the document and the polyfill was
wrong. Reading the draft showed the opposite: it fires at the document's `ModelContext`
(`ontoolchange` is that interface's attribute); the polyfill was right.

## Options

| | |
|---|---|
| Listen on the context only | correct per draft and polyfill |
| **Listen on both** | correct today; free insurance against an implementation that also fires on the document |
| Make the fake fire on the context only | more faithful; a document-only consumer would then pass no test at all |

## Decision

Bridge and devtools attach to both; the harness keeps firing on both, with a guide
note that this is more generous than a browser; a regression test fires on the context
*only* and asserts the bridge notifies.

## What it cost

A listener that never fires, a paragraph of explanation per occurrence, and the
corrected reasoning propagated to six documents.

## Revisit when

Never for code. For docs: if a browser ever fires on the document, the hedge becomes
the reason.
