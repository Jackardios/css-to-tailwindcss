# ADR-13: Tailwind 3 is driven through its internal modules

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Tailwind 3's public API compiles whole stylesheets. The engine needs to compile single candidates, read their order and
list variants, which only the internal modules provide.

## Decision

- The Tailwind 3 adapter uses `resolveConfig`, `lib/lib/setupContextUtils.createContext`,
  `lib/lib/generateRules.generateRules`, and the context's `candidateRuleMap`, `classCache`, `getClassList({
  includeMetadata: true })`, `getClassOrder` and `getVariants`.
- Supported range: **3.4.x**. Earlier versions lack `getClassOrder`, `getVariants` and `includeMetadata` (3.0), or the
  `*:` variant and `size-*` (3.3).
- `console.warn` is silenced only for the duration of `generateRules` calls (type-hint warnings).
- Config files are loaded with the user's own `tailwindcss/loadConfig`, so ESM and TypeScript configs work without new
  dependencies.

**CI matrix** (the adapter contract tests run on each):

- every PR: Tailwind 3.4.0, 3.4.19, 4.1.0, 4.1.17, 4.3.2 and the 4.x in the lock file, on Node 24; runtime tests also
  on Node 22.12;
- nightly: `tailwindcss@latest`, `@insiders` and `@v3-lts`, plus 4.1.18 and 4.2.4 (the `next` dist-tag is a stale
  4.0.0 and is not used);
- weekly: Node 26.

## Consequences

- Internal APIs can change without notice. The contract tests pin every fact the engine relies on, so a change fails CI
  before it reaches users.
- Tailwind 3 is in long-term support, so the risk is lower than it looks.

## Evidence

- The same internals are used by `prettier-plugin-tailwindcss` and Tailwind CSS IntelliSense.
- The prototype's Tailwind 3 path gave identical results on 3.4.0 and 3.4.19: 193 of 193 declarations and 27 of 27
  variant contexts. On 3.3.0 one case differed because `size-*` does not exist there.
- `getClassOrder` and `getVariants` are missing in 3.0.0; `includeMetadata` modifiers appear in 3.3.0; `*:` in 3.4.0.
