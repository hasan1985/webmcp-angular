# M0 — Fidelity findings

Verified against real installed sources, not documentation prose.

- Workspace Angular: **20.3.31**
- `@mcp-b/webmcp-types`: **5.1.0** (depends on `@modelcontextprotocol/server` 2.0.0)
- Source read: `node_modules/@mcp-b/webmcp-types/src/{index,common,json-schema,tool,model-context}.ts`

Status: **partial.** Everything below is confirmed from the types package. The
remaining M0 item — reading Angular v22's real `@angular/core` `.d.ts` — is still
open (see §5).

---

## 1. Corrections to `docs/PLAN.md`

### 1.1 `executeTool` is NOT part of the standard API — PLAN §1.1 was wrong

The spec's `ModelContext` interface is only:

```ts
interface ModelContext extends EventTarget {
  registerTool(tool, options?): Promise<void>;   // 3 overloads
  getTools(options?): Promise<RegisteredTool[]>;
  ontoolchange: ((this: ModelContext, event: Event) => unknown) | null;
}
```

`executeTool` lives in a separate, optional `ChromeModelContextExtensions`:

```ts
interface ChromeModelContextExtensions {
  executeTool?(tool, inputArguments: string, options?): Promise<string | null>;
}
export type ChromeModelContext = ModelContext & ChromeModelContextExtensions;
```

**Impact:** the adapter must feature-detect `executeTool` and never assume it. It
matters only for `/devtools` (manual invocation) and `/testing` — the core library
never calls it.

### 1.2 `ToolDescriptor` from `@mcp-b` is the WRONG shape to reuse — PLAN FR-1.5 was wrong

The plan said "re-export types from `@mcp-b/webmcp-types` rather than redefining."
That is not possible. The two are generic over different things:

```ts
// @mcp-b/webmcp-types — generic over ARGS
type ToolDescriptor<TArgs extends WebMcpToolInput, TResult, TName extends string> = ...

// Angular v22 — generic over the SCHEMA
interface WebMcpToolDescriptor<InputSchema extends JsonSchemaForInference> {
  name: string; description: string; inputSchema: InputSchema; execute: Execute<InputSchema>;
}
```

**Revised FR-1.5:** define `WebMcpToolDescriptor` ourselves to match Angular exactly,
and borrow from `@mcp-b/webmcp-types` only the two inference primitives Angular also
borrows:

```ts
import type { JsonSchemaForInference, InferArgsFromInputSchema } from '@mcp-b/webmcp-types';
```

`JsonSchemaForInference` is simply `JsonSchemaType` re-exported from
`@modelcontextprotocol/server`, so the constraint is identical by construction.
`InferArgsFromInputSchema` is almost certainly Angular's `InferArgs`, but that is the
one inference still to be confirmed in §5.

### 1.3 `consequentialHint` is not in the types package

PLAN §1.1 listed three annotations from the spec draft. The types package ships only:

```ts
interface WebMcpToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}
type ToolAnnotations = McpToolAnnotations & WebMcpToolAnnotations;  // MCP adds destructive/idempotent/openWorld
```

`consequentialHint` appears in the spec prose but not here — live spec drift. Angular's
`WebMcpToolDescriptor` has **no `annotations` property at all**, so this does not affect
the core surface. Do not build anything on `consequentialHint`.

---

## 2. Confirmed, and load-bearing for the design

**Unregistration is `AbortSignal`-only.** Confirmed:

```ts
interface ModelContextRegisterToolOptions { signal?: AbortSignal; exposedTo?: string[]; }
```

No `unregisterTool` anywhere. The `DestroyRef → AbortController → registerTool({signal})`
chain in PLAN §4 is correct and is the whole lifecycle. Build it first (M1).

**Globals are already declared by the types package** — we must not re-declare them:

```ts
interface Document { readonly modelContext?: ModelContext; }
interface Navigator {
  /** @deprecated */ readonly modelContext?: ModelContext;
  /** @deprecated */ modelContextTesting?: ModelContextTesting;
}
```

Both are **optional**, so `document.modelContext?.registerTool(...)` type-checks and the
"unsupported browser" path (FR-3.3) falls out of the type system for free.

**`globalThis.ModelContext` may be undefined.** The package warns a bare reference throws
`ReferenceError`; guard with `typeof ModelContext !== 'undefined'`.

---

## 3. New adapter requirements this uncovered

### FR-3.5 — `RegisteredTool.inputSchema` has two generations

```ts
inputSchema?: InputSchema | string;
```

Per the comment: an object since webmcp#241, rolling out from **Chrome 154.0.8013**
(cross-document tools first); **Chrome 149–153 — most of the current Origin Trial
population — and 154's same-document tools still return a serialized JSON string.**
Consumers must branch on `typeof` and guard the parse of the string arm.

Only affects code reading `getTools()` (`/devtools`, `/testing`), not registration.

### FR-3.6 — `RegisteredTool.title` defaults to `''`

The spec defaults it to the empty string, so `??` does **not** fall through. Read it as
`tool.title || tool.name`. (webmcp#224 proposes omitting the member instead — handle both.)

### FR-3.7 — `navigator.modelContextTesting` is a third fallback

A deprecated `ModelContextTesting` surface (`listTools()`, `executeTool()`, `ontoolchange`)
from older Chromium previews. Angular's own tests use it. Useful for `/testing`; not for core.

---

## 4. Revised adapter resolution order

```
document.modelContext              // canonical, Chrome 150+
  → navigator.modelContext         // deprecated, Chrome 149
  → polyfill (@mcp-b/webmcp-polyfill, optional peer)
  → no-op + single dev-mode warning
```

Unchanged from PLAN FR-3.1 — now confirmed against the ambient type declarations.

---

## 5. Still open — blocks final sign-off on PLAN §2

Read from a real Angular 22 install (`node_modules/@angular/core/index.d.ts`) and record here:

1. Exact `WebMcpToolDescriptor` — does it really have no `title` / `annotations`?
2. The real name and definition of Angular's `Execute<InputSchema>` /
   `WebMcpToolExecute`, and whether its arg type is `InferArgsFromInputSchema`.
3. Exact `WebMcpToolResult` — is `content[].type` `string` or a literal union?
4. Whether `declareExperimentalWebMcpTool` returns `Promise<void>` and what it does on
   duplicate names (throw vs. reject).
5. `withExperimentalAutoCleanupInjectors` — its real signature and which package it lives
   in (`@angular/router`?).
6. Whether Angular passes `exposedTo` at all.

Until these are checked, PLAN §2 is *inferred from docs*, and the parity suite (M3) is the
only thing that can prove compatibility.
