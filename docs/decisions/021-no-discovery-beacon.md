# 021 · Do not add a page-side discovery beacon

**Status:** settled · **Date:** 16 September 2026

## Situation

Reading the lifecycle diagrams, Hasan asked how an agent from outside the browser
learns that a page has WebMCP at all. The draft has no answer: no meta tag, HTTP
header, manifest or well-known URL. An external agent learns of tools only by running
code inside the page. Two page-side additions were considered.

## Options

| | |
|---|---|
| `<meta name="webmcp">` or a well-known URL, emitted by the package | a signal nobody is listening for; every existing agent probes for `document.modelContext` with an injected script, and no agent reads a meta tag |
| Make the bridge's `mcp-server-ready` beacon repeat on an interval | withdrawn on inspection — the bridge already answers `mcp-check-ready` at any time, so a late client is fine *if it knows to probe on that channel*; repeating does not tell a client that does not know |
| **Do nothing on the page side; document the gap and what ships today** | if you only expose tools, whoever is looking finds them; if you are building an external agent, budget for the extension and the probe |

## Decision

No beacon. The gap is described honestly in architecture chapter 9 ("the discovery
gap"): finding the page, knowing it is welcome, hearing an announcement — and why
the second is unresolvable by design (the draft declines to let a page tell agents
apart, which is WebKit's objection seen from the other side).

## What it cost

Nothing in code. In expectations: a reader who assumed "register a tool and agents
come" learns that only the browser's own agent works that way.

## Revisit when

The draft, or the MCP-B ecosystem, agrees on an advertisement mechanism. Emitting it
would then be a one-line addition to `/bridge`.
