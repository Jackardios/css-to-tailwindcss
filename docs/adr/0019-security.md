# ADR-19: Code execution, resources and supply chain

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

The converter runs inside editors on untrusted workspaces, in MCP servers that take input from a model, and in web
pages. Loading a Tailwind setup can execute code, and conversion takes arbitrary CSS and style objects.

## Decision

**Code execution.**

- Code runs when loading a Tailwind 3 JS or TS config, a Tailwind 4 `@plugin` or `@config`, or through `loadModule`.
- `allowCodeExecution` (default `true` in `/node`) refuses all of these with `CODE_EXECUTION_DISABLED`. A Tailwind 4
  entry without `@plugin` and `@config` runs no code.
- The VS Code extension passes `workspace.isTrusted` and declares limited support for untrusted workspaces. MCP servers
  are advised to pass `false`. The CLI always reports which config it executed.
- In the browser, `@plugin` or `@config` without an injected `loadModule` throws `CODE_EXECUTION_DISABLED`.

**File access.** In `/node`, `sandbox: true` keeps `loadStylesheet` inside `base` (for servers).

**Untrusted input.**

- `convertStyle` reads only own properties; `__proto__` and `constructor` keys are handled as data. Property-based tests
  cover them.
- Regular expressions are linted for catastrophic backtracking; long inputs are fuzzed.
- Resource limits: the solver's search stops at 50,000 visits (pinned by a test); option
  `limits: { maxInputBytes, maxRules, maxDepth }` with generous defaults reports what it skipped; HTML mode has an
  element limit.
- postcss runs with `from: undefined` and `map: false`, so input cannot make it read source maps from disk.

**Supply chain.**

- npm trusted publishing with provenance; GitHub Actions pinned to commit SHAs; CodeQL on `main`, `next` and `1.x`;
  `npm audit --omit=dev` clean at the release gate.
- Runtime dependencies are MIT or BSD licensed. The precomputed probe maps (ADR-4) carry Tailwind's MIT notice.

## Consequences

- Users of the extension in untrusted folders get conversion with a code-free Tailwind 4 entry, or an explicit error.
- Limits are reported as diagnostics, never as silent truncation.

## Evidence

- postcss loads a previous source map from disk unless `map` is `false` (checked in `previous-map.js`); 1.x fixed this
  in 1.1.0.
- Browser build of Tailwind 4: `@plugin` without `loadModule` throws ``No `loadModule` function provided``; with an
  injected `loadModule` it works.
