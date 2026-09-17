# 011 · Test the built tarball, never a `file:` install

**Status:** settled · **Date:** September 2026 (measured)

## Situation

The playground first installed the library with `npm i file:../webmcp-angular/dist/...`.
Tool arguments came out as `any` — `TS7031: Binding element 'square' implicitly has an
'any' type` — with nothing pointing at the cause.

## What was happening

A `file:` install is a **symlink**. TypeScript resolves symlinks to their real path,
so from `dist/webmcp-angular/strict/` the import `from 'webmcp-angular'` in
`strict/index.d.ts` walks up from the *real* path and never finds a `node_modules`
containing the package. With `skipLibCheck` on — the Angular CLI default — the
resolution failure is silent and the types degrade to `any`.

## Options

| | |
|---|---|
| Keep `file:` and set `preserveSymlinks` in the consumer | fixes one consumer; every real user who tries a local install hits it |
| Make secondary entry points import the core by relative path | not what `ng-packagr` emits by default; an upstream question, not a local fix |
| **Install the packed tarball** (`npm pack` → `npm i ./x.tgz`), in the playground and in CI | a tarball unpacks into a real directory, exactly like a registry install |

## Decision

The playground and `scripts/check-packaging.mjs` both consume a packed tarball. The
packaging check goes further: it installs the tarball into a real SSR fixture,
type-checks a consumer that uses `/strict`, and prerenders — the only check in the
repo that consumes the library the way a user does.

## What it cost

`npm pack` + reinstall after every library rebuild, and — learned separately —
`rm -rf .angular/cache` after a rename, because `ng serve`'s Vite pre-bundle is keyed
by version and serves the stale package.

## Revisit when

`ng-packagr` changes how secondary entry points reference the primary, or TypeScript
changes symlink resolution defaults.
