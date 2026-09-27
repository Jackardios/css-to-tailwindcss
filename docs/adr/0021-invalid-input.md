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
- A lexer-based validator (css-tree with mdn-data) is a 2.x question. Its bundle and runtime cost are measured in M0 and
  recorded here.

## Consequences

- No new dependency in 2.0 unless the measurement shows it is cheap.
- Users see invalid input preserved rather than reported, until the validator exists.

## Evidence

- A probe of keyword and value inputs against all 183 converters of 1.1.2 found the wrong-property cases listed above.
  1.x does not fix them, because the fix would change the output of valid arbitrary colours.
- Validator cost (bundle size, time per declaration, which invalid values it catches): results from the M0 measurement
  are added here before this record is accepted.
