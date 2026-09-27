# ADR-20: Behaviour policies for cases with more than one reasonable answer

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Research and the 1.x bug history turned up cases where correct behaviour is a choice, not a fact. Each is decided here
once, so that tests and docs can refer to one place.

## Decision

1. **Side effects across rules.** A side effect (ADR-6) is accepted only if the affected property is not set by the
   same anchor in any other context. `.a{line-height:2} .a:hover{font-size:14px}` → `hover:text-[14px]`, not
   `hover:text-sm`. Otherwise the exact form is used or the declaration stays CSS.
2. **`@media screen and (…)`.** Without `strict`: `sm:` plus `media-type-dropped` (ADR-6). With `strict`: an arbitrary
   variant.
3. **`var()` inside a shorthand.** The shorthand is not split into longhands, because the value is only known at
   computed-value time and may be invalid there. Only `[prop:val]` is possible (when `arbitrary.properties` is on);
   otherwise it stays CSS.
4. **Physical properties matched by logical utilities** (TW4 `px` is `padding-inline`): accepted with
   `writing-mode-assumed`; refused under `strict`.
5. **Pseudo-element plus state** (`:hover::before`, `:hover::file-selector-button`): through the variant table
   (ADR-11), with mandatory real-interaction probes in the browser suite.
6. **Keyframes.** `animate-*` is not used when the file defines `@keyframes` with the same name, when Tailwind 3 has a
   prefix, or when the Tailwind 4 `@theme` keyframes body differs. Reported as `keyframes-conflict`.
7. **`!important` and Tailwind's rule merging.** Tailwind merges adjacent rules and duplicate declarations regardless of
   `!important`. This is an invariant in the adapter contract tests. `width: 13px !important; width: 4px` is resolved
   by the placement model (ADR-14).
8. **Tailwind 3 component classes and Tailwind 4 `@utility`** are not used as matches by default (`components: false`).
9. **`important` in the Tailwind config** is reported by the adapter. It does not affect `@apply` in Tailwind 3; in
   `output: 'classes'` the cascade model takes it into account.
10. **`darkMode: 'selector' | 'variant'` and Tailwind 3 container queries** go through the variant table and need
    explicit cases.
11. **Input that already uses Tailwind syntax.** An existing `@apply` stays; new classes go into a separate `@apply` at
    the position of the first converted declaration. `theme()`, `--spacing()` and `--alpha()` are not touched
    (`tailwind-function`). Rules inside `@layer` are converted. `@import` and `@charset` are not touched.
12. **Formatting is a renderer invariant.** Only changed nodes are rewritten. Comments stay with their declarations. CRLF
    line endings and a BOM are preserved. Untouched rules stay byte for byte (property-based test).
13. **Deferred from 1.1.2**, resolved by the placement model: adjacency that appears after intermediate rules are
    removed, and identical adjacent `@media` blocks that Tailwind merges.
14. **Reset-only declarations** (`outline: 0`) must produce output or stay CSS (ADR-10).

**Defaults** decided with these policies: `remInPx: 16`; `arbitrary: { values: true, properties: false, variants: true }`;
`selectors.descendants: 'auto'` (`apply` output keeps descendant selectors in place, `classes` output uses `[&>x]:`).

## Consequences

- Each item has cases in the shared case files; the docs list the policies under "Guarantees and limitations".
- Changing a policy is a new ADR.

## Evidence

- Items 5–7 are the families of the four bugs found by differential testing of 1.1.1 (pseudo-element order,
  `animate-*` keyframes, `!important` merging); they were fixed conservatively in 1.1.2.
- Item 14 comes from the prototype's `outline: 0` data-loss bug (ADR-5).
