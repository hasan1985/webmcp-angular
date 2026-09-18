# 014 · Devtools is plain DOM in a shadow root, behind a dynamic import

**Status:** settled · **Date:** September 2026

## Situation

An in-page inspector — list tools, invoke one, watch `toolchange` — is the fastest way
to see whether a tool registered. It must live inside the app it inspects.

## Options

| | |
|---|---|
| An Angular component in a template | idiomatic; lives in the injector tree and change-detection cycle it observes; lands in the main bundle |
| **`mountWebMcpDevtools({container, position, open, shortcut})` building plain DOM in a shadow root** | no `@angular/core` import, so it cannot perturb change detection, zoneless scheduling or the injector tree; styles cannot leak either way; a function behind `import()` becomes its own lazy chunk |

## Decision

Plain DOM, shadow root, host attribute `data-webmcp-angular-devtools`,
`Ctrl/Cmd+Shift+M`. In production a lazy chunk (8.59 kB) never requested — an early
doc's "never reaches the production bundle" was corrected to say so.

## What it cost

No templating: string-built DOM with manual re-render; argument drafts preserved across
re-renders by hand.

## Revisit when

The panel needs enough interactivity that hand-rolled DOM becomes the bug source.
