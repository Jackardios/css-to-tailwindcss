# ADR-11: Variants are matched against a table built by compiling

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Version 1 maps pseudo-classes and media queries to variants with hand-written tables. They ignore the user's
configuration (`darkMode`, custom screens, `@custom-variant`) and produced wrong variants (`[aria-disabled="true"]` →
`disabled:`). Tailwind 4 changed several variants: `hover:` adds `@media (hover: hover)`, `not-*` and `*:` exist.

## Decision

1. Compile a probe utility under every variant, including every value of functional variants, in one batch.
2. Normalize each result into a context key and build a table from context key to variant names.
3. Split an input context into atoms (each at-rule, each pseudo-class or pseudo-element, the remaining relative
   selector) and collect candidates per atom: table hits first, then (not in `strict`) hits after removing
   `@media (hover: hover)`, then arbitrary forms (`min-[…]`, `max-[…]`, `supports-[…]`, `[@media(…)]`,
   `[@container(…)]`, `[selector]`).
4. Compile stacked combinations in rank order and accept the first whose compiled context equals the input.
5. Report extra declarations, such as `content` from `before:`, as side effects.

Arbitrary variants are on by default (`arbitrary.variants: true`). In `strict`, `hover-media` is not accepted and
`[&:hover]:` is used instead.

## Consequences

- Custom `darkMode`, screens and `@custom-variant` work without configuration.
- A variant that compiles to a superset of the input context is refused. Example: with a custom Tailwind 4 dark variant
  that compiles to `&:where(.dark, .dark *)`, the input `.dark &` becomes `[.dark_&]:`, not `dark:`, because the
  variant also matches the element itself.
- Context equivalence is string-based after normalization; semantic equivalence (for example `:where` specificity) is
  covered by the behaviour policies and the browser tests (ADR-18, ADR-20).

## Evidence

27 input contexts, 4 configurations, idiomatic and strict: 27 of 27 matched in every run.

| Configuration | Table | Build (loaded machine) | Per context median / max |
|---|---|---|---|
| TW3 default | 149 contexts / 155 names | 103 ms | 0.17 / 1.1 ms |
| TW3 `darkMode:'class'` | 149 / 155 | 67 ms | 0.13 / 9.1 ms |
| TW4 default | 310 / 392 | 203 ms | 0.44 / 10.7 ms |
| TW4 `@custom-variant dark` | 314 / 396 | 236 ms | 0.32 / 15.8 ms |

Almost every match takes one compile; TW3 `focus:hover:` needs two (reversed order), strict `[&::before]:` three.
Examples: `@media (max-width: 639px)` → `[@media(width<=639px)]:`; `:not(:first-child)` → TW4 `not-first:`, TW3
`[&:not(:first-child)]:`; `.group:hover &` → `group-hover:`.
