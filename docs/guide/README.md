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
| 5 | [Inspecting and connecting](./05-inspecting-and-connecting.md) | The dev inspector, and reaching Claude Desktop or Cursor |
| 6 | [Migrating to Angular 22](./06-migrating-to-angular-22.md) | One command, and what it will and won't do for you |
| — | [API reference](./api-reference.md) | Every export, by entry point |

## What this package is

Angular 22 ships experimental WebMCP support in `@angular/core`. This package is an
**API-compatible backport of it for Angular 20 and 21**, plus a few things Angular
doesn't provide (a test harness, a dev inspector, a bridge to desktop MCP clients).

The core entry point is signature-identical to v22 on purpose, so migrating is a
change of import path — and there's [a schematic](./06-migrating-to-angular-22.md)
that does even that for you.

```ts
import { provideExperimentalWebMcpTools } from 'webmcp-angular';
// at Angular 22 ──▶
import { provideExperimentalWebMcpTools } from '@angular/core';
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

What that means for you in practice: pin the version, and expect the odd breaking
change in a minor. The [architecture course's last chapter](../architecture/06-what-bites-you.md)
lists where the ground has already moved.

[spec]: https://webmachinelearning.github.io/webmcp/
