# 014 · Devtools is plain DOM in a shadow root, behind a dynamic import

**Status:** settled · **Date:** September 2026

## Situation

An in-page inspector — list the registered tools, invoke one with hand-typed
arguments, watch `toolchange` — is the fastest way to see whether a tool registered
at all. It has to sit inside the app it inspects.

## Options

| | |
|---|---|
| An Angular component you drop in a template | idiomatic; but it lives in the injector tree and change-detection cycle it is meant to observe, and it lands in the main bundle |
| **A `mountWebMcpDevtools({container, position, open, shortcut})` function that builds plain DOM in a shadow root** | no `@angular/core` import, so it cannot perturb change detection, zoneless scheduling or the injector tree; shadow DOM means app styles cannot leak in and panel styles cannot leak out; a function call can sit behind `import()` so it becomes its own lazy chunk |

## Decision

Plain DOM, shadow root, host attribute `data-webmcp-angular-devtools`, opened with
`Ctrl/Cmd+Shift+M` by default. In production it is a lazy chunk (8.59 kB) that is
never requested — an early doc claimed it "never reaches the production bundle" and
was corrected to say that.

## What it cost

No Angular templating: the panel is string-built DOM with manual re-render, and
preserving argument drafts across a re-render had to be done by hand.

## Revisit when

The panel needs enough interactivity that hand-rolled DOM becomes the bug source.
