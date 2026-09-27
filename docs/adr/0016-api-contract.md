# ADR-16: Call contract: sync conversion, results, diagnostics and errors

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Version 1 returns a mutable postcss `Root` from an async call and reports nothing about what it could not convert.
Consumers need different things: editors and ESLint rules need synchronous calls, the CLI and MCP servers need JSON,
and everyone needs to know why a declaration stayed CSS.

## Decision

**Lifecycle and synchrony.**

- Loading Tailwind is the only async step: `tailwind4()`, `tailwind3()` and `loadTailwind()` return an opaque
  `Tailwind` handle with `version`, `major`, `prefix`, `preflight`, `entry` and `dependencies` (the files read while
  loading, for watching).
- `createConverter(options)` and every `convert*` call are **synchronous**; this is a documented guarantee. A future
  async feature gets a new method.
- A converter is long-lived. Shard caches are shared per handle. There is no `dispose()`.
- Output is deterministic and does not depend on earlier calls.
- `warmup({ signal })` is optional and async, for editors.

**Results.**

- `convertCSS(css, { output })` returns `ApplyResult` or `ClassesResult`, distinguished by `output`. Both carry
  `css`, `rules`, `diagnostics` and `summary`; `ClassesResult` adds `classes` per anchor, and its `css` holds only the
  leftover.
- `convertDeclarations(block)` and `convertStyle(object)` return classes, utilities, the leftover and diagnostics.
  Invariant: the classes plus the leftover reproduce the input.
- Results are plain JSON: no postcss nodes, `Map`, `Set`, `bigint` or `undefined`; absent values are `null`. A test
  checks `JSON.parse(JSON.stringify(r))` equals `r`. A JSON Schema is published for the CLI and MCP.
- Classes are listed in Tailwind's canonical order.

**Diagnostics.** `{ code, severity, message, rule, source, declaration, classes, data }`. `source` has 1-based line and
column and a 0-based UTF-16 offset. `code` and the shape of `data` are stable; `message` is English and is not.

Codes: `side-effect`, `approximated`, `relies-on-preflight`, `overlapping-classes`, `unsupported-selector`,
`unsupported-context`, `no-utility`, `arbitrary-disabled`, `strict-rejected`, `verification-failed`,
`cascade-conflict`, `keyframes-conflict`, `invalid-declaration` (reserved, ADR-21), `skipped-at-rule`,
`custom-property`, `tailwind-function`, `reference-unsupported`, and for HTML mode `html-unused-rule`,
`html-unknown-stylesheet`, `html-scripts-present`, `html-style-attribute-conflict`.

**Errors.** Only an unusable environment or input throws: `CssToTailwindError` with a `code`, branded with
`Symbol.for` so that `isCssToTailwindError()` works across duplicate ESM and CJS copies. Codes: `INVALID_OPTIONS`,
`TAILWIND_NOT_FOUND`, `TAILWIND_VERSION_MISMATCH`, `TAILWIND_UNSUPPORTED_VERSION`, `TAILWIND_LOAD_FAILED`,
`STYLESHEET_NOT_FOUND`, `CONFIG_NOT_FOUND`, `CONFIG_AMBIGUOUS`, `CONFIG_LOAD_FAILED`, `CODE_EXECUTION_DISABLED`,
`CSS_SYNTAX_ERROR`. Anything about conversion quality is a diagnostic and never throws.

**Options.** JSON only (no functions; loaders belong to the factories). Unknown keys throw `INVALID_OPTIONS`, with a
hint for option names from 1.x. There is no compatibility wrapper for the 1.x `TailwindConverter` class.

**Evolution.** Adding a diagnostic code, error code, side-effect kind or option is a minor release; renaming or removing
one is a major release. The docs tell consumers not to switch exhaustively over codes without a default branch.

The library writes nothing to the console and collects no telemetry.

## Consequences

- ESLint rules, code actions and codemods can call the converter synchronously.
- The CLI, MCP servers and the extension share one result format.
- 1.x users migrate by the table in `MIGRATION.md`; there is no deprecated shim to maintain.

## Evidence

- Every step of conversion is synchronous in both versions: TW4 `candidatesToAst`, TW3 `generateRules`, parse5.
  Only loading the TW4 design system and importing configs is async.
- The VS Code extension (1.2.6) wraps declarations in a random selector and converts the postcss `Root` with
  postcss-js; `convertDeclarations` and `convertStyle` replace that.
