# ADR-10: Conversion knows whether preflight is present

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Shorthands reset longhands: `border: 1px solid` also sets `border-color: currentcolor`. Tailwind utilities often rely on
preflight for such values instead of setting them. Whether a utility reproduces the input therefore depends on whether
preflight is loaded, which differs between projects (TW3 `corePlugins.preflight`, a TW4 entry without the preflight
import).

## Decision

- The adapter reports the baseline: the declarations preflight applies to every element, or none when preflight is off.
- Option `preflight: boolean` overrides what the adapter detected.
- A value that the input sets may be left out of the output only when the baseline sets the same value. That is
  reported with `relies-on-preflight`.
- Declarations that only reset values (`outline: 0`) must still produce output or stay CSS; they are never dropped.

## Consequences

- Correct results with and without preflight; the test matrix runs both (ADR-18).
- Users who remove preflight after converting are warned by the diagnostics.

## Evidence

- Tailwind 3 `border:1px solid` → `border` is wrong without an explicit colour, because `border` relies on the preflight
  border colour while the input resets it to `currentcolor`. Verification rejects it.
- `outline:0` produced no classes in the prototype until reset-only declarations were made mandatory.
- Tailwind 4 `border` sets `border-style: solid`, which equals the preflight value; this is the `preflight-default` side
  effect (ADR-6).
