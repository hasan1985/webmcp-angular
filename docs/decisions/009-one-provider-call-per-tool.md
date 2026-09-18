# 009 · One `provideWebMcpTools` call per tool; `/strict` for authoring

**Status:** settled · **Date:** September 2026

## Situation

`provideWebMcpTools<const S>(tools: WebMcpToolDescriptor<S>[])` has one type parameter
for the whole array, so tools with different schemas collapse into a union and stop
type-checking — [angular#70125](https://github.com/angular/angular/issues/70125), open.
It is Angular's signature, and [001](./001-mirror-angular-not-invent.md) says we
replicate signatures.

## Options

| | |
|---|---|
| Fix the signature in our core | better typing; api-diff fails; the schematic's rewrite would change behaviour |
| `as unknown as WebMcpToolDescriptor<never>[]` | compiles; discards the typing the schema was for |
| **One call per tool** | each array homogeneous; zero casts; identical on 22 |
| **Plus `webMcpTool()` in `/strict`** — an identity function pinning each schema to its own type parameter | fixes *authoring* (typed `execute` args); does not fix the provider call, and docs must say so |

## Decision

Replicate the defect; teach one-call-per-tool; ship `webMcpTool()` as an optional
authoring aid. Nothing new filed upstream — the issue exists.

## What it cost

Six tools, six calls. An early doc overstated what `/strict` fixes and was corrected.

## Revisit when

angular#70125 closes; the core follows Angular's fix and `/strict` may be redundant.
