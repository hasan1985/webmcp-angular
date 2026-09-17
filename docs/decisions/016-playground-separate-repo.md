# 016 · The sample app is a separate repo consuming the built package

**Status:** settled · **Date:** September 2026

## Situation

A sample app was needed to verify the library in a real browser and to demonstrate
it: a game an agent can play, page-scoped tools, a chat, the inspector. Hasan:
*"I don't want the sample app part of the webmcp package, rather a separate project."*

## Options

| | |
|---|---|
| A second project in the library workspace, importing source | fast inner loop; but it never exercises the `exports` map, the entry-point `.d.ts`, the peer ranges, or packaging — it tests source, not the artifact |
| **A separate repo (`webmcp-angular-playground`) installing the packed tarball** | consumes exactly what ships; a packaging bug is a playground bug on day one |

## Decision

Separate repo, tarball install. It caught the `file:` symlink bug
([011](./011-tarball-not-file-install.md)) before any user did, and it is where every
"measured in Chrome" finding came from: the route-provider leak, the `toolchange`
target, the polyfill's `executeTool` shape.

## What it cost

Rebuild → `npm pack` → reinstall → `rm -rf .angular/cache` on every library change,
and a second repo to keep in step. STATUS.md carries the exact commands.

## Revisit when

Never, for the principle. A workspace-local smoke app could be *added* for the inner
loop, as long as the tarball path remains the one that gates.
