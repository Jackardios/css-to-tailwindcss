# ADR-5: Every result is verified by compiling it; doubt means refusal

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Version 1 trusted its hand-written mappings. A differential test against real Tailwind output found four classes of bugs
that its test suite asserted as correct, such as `!important` lost when Tailwind merged rules and `animate-*` bringing
Tailwind's own keyframes. A converter that silently changes rendering is worse than one that leaves CSS alone.

## Decision

- Every candidate class list is compiled with the user's Tailwind, in the rule's real context (variants, other
  utilities on the same anchor), normalized, and compared with the input declarations.
- The comparison results in `exact`, `side-effect` (ADR-6), `approximated` (ADR-6, ADR-7) or failure.
- On failure the engine retries declaration by declaration; whatever still fails stays CSS with a
  `verification-failed` diagnostic.
- Verification cannot be turned off.

## Consequences

- Wrong mappings become leftover CSS instead of wrong output. Coverage can be improved later without risking
  correctness.
- The normalizer (units, colours, `calc()`, variables, shorthands) decides what "equal" means, so its gaps show up as
  false refusals. That is the intended direction of failure.
- Invalid input values cannot become a utility for a different property (ADR-21).

## Evidence

- Cost per rule: median 0.03–0.04 ms, p90 0.08–0.12 ms, maximum 2.7 ms (1,338 verifications, loaded machine).
- Browser oracle over 1,338 (input, class list) pairs, including our output, the other Tailwind version's output,
  canonicalize output and hand-made traps:

  | Set | Pairs | False accepts | False rejects |
  |---|---|---|---|
  | Sample (normalizer tuned on it) | 1,004 | 0 | 0 |
  | Held-out (untuned) | 334 | 0 | 1 (TW4 `transform-gpu`: `translate3d(0,0,0)` vs `translateZ(0)`) |

- Traps it rejects correctly: `color:#ef4444` → TW4 `text-red-500` (the palette changed); TW4 `sr-only` (`clip` vs
  `clip-path`); TW4 `outline-2` (also sets `outline-style`); `transition: opacity .3s ease` → `transition-opacity
  duration-300` (timing function differs); TW3 `border:1px solid` → `border` (relies on the preflight colour while the
  input resets it to `currentcolor`).
- The first run on the held-out set found five normalizer gaps (`transform-origin` keywords, preflight-aware resets,
  TW4 transform longhands, `calc(infinity*1px)` radius, dead longhands) and one data-loss bug: `outline:0` produced no
  classes because it only resets values. Reset-only declarations are now required to produce output (ADR-20).
