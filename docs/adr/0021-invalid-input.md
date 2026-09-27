# ADR-21: Invalid input is preserved, never converted to another property

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

A browser drops a declaration whose value is invalid for its property. Version 1 converts some invalid values into a
utility for a **different** property, which the browser then applies: `color: small` → `text-[small]` (font-size),
`background-color: 12px` → `bg-[12px]` (background-position), `stroke: 3` → stroke-width, `outline-color: 3` →
outline-width. A converter cannot fix invalid CSS, but it must not change what the page does.

## Decision

- Equivalent garbage in, equivalent garbage out. Verification (ADR-5) guarantees that the output sets the **same
  property** as the input, so `color: small` can never become a font-size utility. It does not check that the value is
  valid.
- An invalid value may end up as an arbitrary value of the same property, which the browser drops exactly as it drops
  the input, or stay CSS.
- Diagnostic code `invalid-declaration` is reserved for a future validator.
- **No validator in 2.0, and never in the core.** A lexer-based validator (css-tree with mdn-data) may come in 2.x as
  an opt-in: its own subpath or an injected `validate(property, value)` hook. It would only warn, skip values that
  contain `var()` or `env()`, and treat a value unknown to its data as unknown rather than invalid, so that new CSS
  never loses a class because of it.

## Consequences

- No new dependency in 2.0.
- Users see invalid input preserved rather than reported, until the validator exists.

## Evidence

- A probe of keyword and value inputs against all 183 converters of 1.1.2 found the wrong-property cases listed above.
  1.x does not fix them, because the fix would change the output of valid arbitrary colours.
- Validator cost, measured in M0 (esbuild, minified, gzip -9):
  - lexer, value parser and mdn-data: 196 KB minified, **55 KB gzip**; mdn-data is about 21 KB of it and cannot be
    tree-shaken. Core + Tailwind 4 + validator: **197.9 KB gzip**, against the 150 KB budget (144 KB without it);
  - import 11 ms; 0.008–0.012 ms per declaration;
  - it flags 13 of 14 invalid probes (`color: small`, `padding-top: -4px`, `width: 10pxx`, a 5-value `margin`,
    `opacity: red`, `z-index: 1.5`, `#ggg` and others) and misses `calc(1px +)`;
  - it rejects 7 valid values: anything with `var()` or `env()`, relative colours `rgb(from …)`, `calc-size()` and
    `contrast-color()`, because mdn-data lags behind new CSS. It accepts `oklch()`, `color-mix()`, `light-dark()`,
    `anchor()`, `round()`, container and `lh` units.
