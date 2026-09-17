# 009 · One `provideWebMcpTools` call per tool; `/strict` for authoring

**Status:** settled · **Date:** September 2026

## Situation

`provideWebMcpTools<const S>(tools: WebMcpToolDescriptor<S>[])` has one type parameter
for the whole array, so tools with different schemas collapse into a union and stop
type-checking — [angular#70125](https://github.com/angular/angular/issues/70125),
still open. It is Angular's signature, and [001](./001-mirror-angular-not-invent.md)
says the core replicates Angular's signatures.

## Options

| | |
|---|---|
| Fix the signature in our core (variadic generics, or a mapped tuple) | better typing; but a different signature from Angular means the parity api-diff fails and the schematic's import rewrite would change behaviour |
| Tell users to cast: `as unknown as WebMcpToolDescriptor<never>[]` | compiles; throws away the typing that made writing a schema worthwhile |
| **One call per tool** — `provideWebMcpTools([a]), provideWebMcpTools([b])` | each array is homogeneous; zero casts; identical on Angular 22 |
| Plus **`webMcpTool()` in `/strict`** — an identity function that pins each descriptor's schema to its own type parameter | fixes *authoring* (typed `execute` args as you write the tool); does not fix the provider call, and the docs must say so |

## Decision

Replicate the defect in the core; teach one-call-per-tool as the pattern; ship
`webMcpTool()` as an optional authoring aid. Filed nothing new upstream because the
issue already exists.

## What it cost

A provider array of six tools is six calls. An early doc overstated what `/strict`
fixes and had to be corrected.

## Revisit when

angular#70125 closes. Then the core's signature follows Angular's fix, the pattern
becomes optional, and `/strict` may become redundant.
