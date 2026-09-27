# ADR-1: The Tailwind adapter exposes primitives; the engine makes every decision

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Version 1 encodes Tailwind 3.2 by hand: about 2,250 lines of converters map each CSS property to class names, and the
cascade rules assume Tailwind 3 ordering. Version 2 must support Tailwind 3 and Tailwind 4 with one code base, and
Tailwind 4 changes class names, arbitrary-value syntax, the important modifier, the prefix format, cascade layers and the
shape of compiled CSS.

An early design put matching inside the adapter (`adapter.candidates(declarations)`). That duplicates arithmetic,
variant search and verification per version.

## Decision

The adapter exposes only what Tailwind knows. The engine (indexing, set cover, arithmetic, arbitrary fallback, variant
search, verification, placement) is shared and contains no version checks.

```ts
interface TailwindAdapter {
  version: 3 | 4
  classList(): ClassInfo[]                          // name, root, value, negative, modifiers, deprecated
  compile(candidates, opts?): (Compiled | null)[]   // blocks with the class selector replaced by `&`, at-rule chain
  order(candidates): (bigint | null)[]              // cascade order, comparable only within one call
  env: VarEnv                                       // theme variables and @property initial values (TW4), universal defaults (TW3)
  themeTokens(): ThemeToken[]                       // name, value, colour; for value-directed lookup (ADR-2)
  baseline(): Declaration[]                         // preflight declarations, see ADR-10
  variants(): VariantInfo[]
  format(parts: { variants, utility, important }): string   // prefix, separator, `!` position
  arbitraryValue(root, value, typeHint?): string
  arbitraryProperty(property, value): string
  utilitiesLayered: boolean                         // TW4 utilities live in @layer utilities
  canonicalize?(candidates): string[]               // optional, tests only (ADR-3)
}
```

**Tailwind 4 AST normalization is part of the adapter contract.** `compile` always returns the flattened shape of
4.3.3: nested `&` rules are resolved into full selectors and at-rules are hoisted above the rule. Versions without
`candidatesToAst` (below 4.1.18) build the same AST from `candidatesToCss` plus postcss.

`order()` is the only way to get cascade order. Its values are never cached across calls.

## Consequences

- One engine, written and tested once; the two adapters are small.
- Each adapter has a contract test suite (ADR-18) that pins the Tailwind facts the engine relies on, including "the
  normalized AST has the same shape on every version in the CI matrix".
- Version-specific constants that v1 kept in the core (`TAILWIND_LAYERS`, arbitrary-value escaping, transform order)
  move into the adapters.
- The fallback below 4.1.18 is 3–5× slower to compile, but only on those versions and only for shards that are touched.

## Evidence

- The prototype adapters are 131 (TW3) and 159 (TW4) lines. `src/core`, `src/engine` and verification contain no
  version checks; only the bigint order and a `deprecated` flag cross the boundary.
- Tailwind 4 changed the compiled AST shape in a **patch** release. `candidatesToAst(['hover:bg-red-500'])`:
  - 4.1.18–4.3.2: `.hover\:bg-red-500 { &:hover { @media (hover: hover) { … } } }` (nested);
  - 4.3.3: `@media (hover: hover) { .hover\:bg-red-500:hover { … } }` (flattened).
- Without normalization, variant matching found 16 of 27 contexts on 4.1.18 and 4.3.2 (27/27 on 4.3.3). With a
  40-line normalization shim: 27/27 on 4.0.0, 4.0.17, 4.1.0, 4.1.14, 4.1.17, 4.1.18, 4.3.2 and 4.3.3.
- Declaration output on the 199-case sample was identical to 4.3.3 on 4.1.14, 4.1.17 (postcss fallback), 4.1.18 and
  4.3.2. Versions 4.1.18–4.3.2 were about 21% of all `tailwindcss` downloads in the week measured.
- Fallback cost over all 23,286 classes on 4.3.3: `candidatesToAst` 110–384 ms against `candidatesToCss` 160–220 ms
  plus `postcss.parse` 390–440 ms.
- `getClassOrder` values from two calls are not comparable, in both versions.

## Alternatives

- **Adapter returns candidates for declarations.** Rejected: arithmetic, variants and verification would be written
  twice, and the core would leak version logic.
- **Separate converters per Tailwind version.** Rejected for the same reason, at a larger scale.
