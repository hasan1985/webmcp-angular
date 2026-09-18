# 021 · Do not add a page-side discovery beacon

**Status:** settled · **Date:** 16 September 2026

## Situation

Hasan asked how an agent outside the browser learns a page has WebMCP. The draft has no
answer — no meta tag, header, manifest or well-known URL; an external agent learns of
tools only by running code inside the page.

## Options

| | |
|---|---|
| `<meta name="webmcp">` or a well-known URL | nobody listens; every existing agent probes `document.modelContext` with an injected script |
| Repeat the bridge's `mcp-server-ready` on an interval | withdrawn: the bridge already answers `mcp-check-ready` at any time; repeating does not inform a client that does not know the channel |
| **Nothing page-side; document the gap and what ships** | exposing tools costs nothing; building an external agent means budgeting for the extension and probe |

## Decision

No beacon. Chapter 9 ("the discovery gap") states the three missing pieces — finding
the page, knowing it is welcome, hearing an announcement — and why the second is
unresolvable by design: the draft declines to let a page tell agents apart, WebKit's
objection from the other side.

## What it cost

Nothing in code; in expectations, "register a tool and agents come" is true only for
the browser's own agent.

## Revisit when

The draft or the MCP-B ecosystem agrees an advertisement mechanism; emitting it is a
one-line addition to `/bridge`.
