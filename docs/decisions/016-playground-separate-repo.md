# 016 · The sample app is a separate repo consuming the built package

**Status:** settled · **Date:** September 2026

## Situation

A sample app was needed to verify in a real browser and to demonstrate: a game, page-
scoped tools, a chat, the inspector. Hasan: *"I don't want the sample app part of the
webmcp package, rather a separate project."*

## Options

| | |
|---|---|
| A second project in the workspace, importing source | fast inner loop; never exercises the `exports` map, entry-point `.d.ts`, peer ranges or packaging |
| **A separate repo installing the packed tarball** | consumes exactly what ships; a packaging bug is a playground bug on day one |

## Decision

Separate repo (`webmcp-angular-playground`), tarball install. It caught the `file:`
symlink bug ([011](./011-tarball-not-file-install.md)) before any user, and every
"measured in Chrome" finding came from it: the route leak, the `toolchange` target, the
polyfill's `executeTool` shape.

## What it cost

Rebuild → `npm pack` → reinstall → `rm -rf .angular/cache` per library change, and a
second repo to keep in step. STATUS carries the commands.

## Revisit when

Never for the principle. A workspace smoke app could be *added* for the inner loop as
long as the tarball path gates.
