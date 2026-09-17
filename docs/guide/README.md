# Using webmcp-angular

How to expose your Angular app's features to AI agents.

This is the **usage** guide. For how WebMCP actually works underneath — the browser
API, the lifecycle, why any of it is shaped this way — read
[the architecture course](../architecture/README.md) instead. They cross-link; you
don't need both.

## Start here

| | | |
|---|---|---|
| 1 | [Getting started](./01-getting-started.md) | Install, wire it up, and register a working tool in about five minutes |
| 2 | [Writing tools](./02-writing-tools.md) | Schemas, validation, error text, descriptions that agents actually follow |
| 3 | [Scoping tools](./03-scoping-tools.md) | App, component and service scope — and the one that leaks |
| 4 | [Testing](./04-testing.md) | Assert on what your app exposes, with no browser |
| 5 | [The in-page agent](./05-in-page-agent.md) | **The main case.** Your app calls the LLM itself and hands it the page's tools — discover, run, the streaming loop |
| 6 | [External agents](./06-external-agents.md) | Claude Desktop, Cursor, an extension reaching in through the bridge — and why that is opt-in |
| 7 | [Inspecting](./07-inspecting.md) | The dev inspector |
| 8 | [Switching to Angular's native API](./08-migrating-to-angular-22.md) | If and when you want to — one command, and what it will and won't do |
| — | [API reference](./api-reference.md) | Every export, by entry point |

## Two kinds of agent

Decide this first; it determines which entry points you need.

| | The harness runs… | Reaches your tools by… | You need |
|---|---|---|---|
| **In-page agent** — [chapter 5](./05-in-page-agent.md) | in your app: a chat panel that calls the LLM's API itself | `document.modelContext`, directly | core + polyfill |
| **External agent** — [chapter 6](./06-external-agents.md) | outside the page: an extension, Claude Desktop, Cursor | MCP over JSON-RPC, through the bridge | core + polyfill + `/bridge`, **opt-in** |
| The browser's own agent | in the browser | it owns `document.modelContext` | nothing extra |

## What this package is

Angular 22 ships WebMCP support in `@angular/core` (as `@experimental`). This package
brings the same API to **Angular 20 and 21**, plus a few things Angular doesn't
provide: a test harness, a dev inspector, and a bridge to desktop MCP clients.

The core entry point mirrors Angular's deliberately, so **switching to the native API
stays an easy option** — [a schematic](./08-migrating-to-angular-22.md) does it for
you. Whether you ever take it is your call; the entry points Angular has no
equivalent for are a good reason not to.

```ts
import { provideWebMcpTools } from 'webmcp-angular';
// at Angular 22 ──▶
import { provideWebMcpTools } from '@angular/core';
```

## Requirements

- **Angular 20, 21 or 22.** On 22 you can use `@angular/core` directly instead.
- **A browser with WebMCP**, or the polyfill. Native support is Chromium-only and
  currently behind a flag, so in practice you install the polyfill —
  [step 2 of getting started](./01-getting-started.md#2-install-the-polyfill).

## A word on stability

WebMCP is a [W3C Community Group draft][spec] and Angular's support is marked
`@experimental` — the API may change outside a major version, and it already has
twice. This package is `0.x` and tracks it.

It is also contested between browser engines — Chromium implementing, Mozilla
neutral, WebKit opposed — which makes this a Chromium-plus-polyfill proposition
rather than a bet on a future standard. See
[will this be standardised?](../architecture/09-will-this-be-standardised.md).

What that means for you in practice: pin the version, expect the odd breaking change
in a minor, and keep tools as thin wrappers over services that know nothing about
WebMCP — then you can walk away from the layer without touching your app.
[Where the ground has already moved](../architecture/06-what-bites-you.md).

[spec]: https://webmachinelearning.github.io/webmcp/
