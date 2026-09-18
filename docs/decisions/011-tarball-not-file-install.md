# 011 · Test the built tarball, never a `file:` install

**Status:** settled · **Date:** September 2026 (measured)

## Situation

The playground first used `npm i file:../webmcp-angular/dist/...`. Tool arguments came
out `any` — `TS7031: Binding element 'square' implicitly has an 'any' type` — with
nothing pointing at the cause. A `file:` install is a **symlink**; TypeScript resolves
to the real path, so `strict/index.d.ts`'s `from 'webmcp-angular'` never finds a
`node_modules` containing the package; with `skipLibCheck` (CLI default) the failure is
silent.

## Options

| | |
|---|---|
| Keep `file:`, set `preserveSymlinks` | fixes one consumer; every local install hits it |
| Relative imports between entry points | not what `ng-packagr` emits; an upstream question |
| **Install the packed tarball** (`npm pack` → `npm i ./x.tgz`) in the playground and CI | unpacks to a real directory, like a registry install |

## Decision

Playground and `scripts/check-packaging.mjs` consume a packed tarball. The packaging
check also installs it into a real SSR fixture, type-checks a `/strict` consumer, and
prerenders — the only check that consumes the library as a user does.

## What it cost

`npm pack` + reinstall per rebuild, and `rm -rf .angular/cache` after a rename — `ng
serve`'s Vite pre-bundle is keyed by version.

## Revisit when

`ng-packagr` changes how secondary entries reference the primary, or TypeScript changes
symlink resolution.
