# ADR-7: Colours are compared in OKLab; approximation is opt-in

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Input colours come as hex, `rgb()`, `hsl()`, named colours, `oklch()` and `color-mix()`. Tailwind 3 themes are mostly
hex; Tailwind 4 themes are `oklch()`. String comparison misses equal colours; a loose tolerance maps one colour to a
visibly different one. Users migrating from Tailwind 3 also ask for "the nearest palette colour" (issue #19).

## Decision

- Both sides are normalized to sRGB and compared by OKLab distance. The tolerance for **exact** is 0.002, which covers
  rounding noise only.
- When a colour had to be clipped to the sRGB gamut, the match is reported as `color-gamut` (ADR-6).
- When both sides are `oklch()`, they are compared in OKLab without clipping, so an input equal to a Tailwind 4 palette
  entry is exact.
- `approximate` is opt-in: `true` or `{ colorDeltaE, lengthPx }`, defaulting to ΔE 2 and 0.5 px. ΔE is CIEDE2000.
  Every approximated colour is reported as `color-delta` with the expected value, the actual value and the delta.
- `approximate` together with `strict` is an `INVALID_OPTIONS` error.

## Consequences

- The default output never changes a colour beyond rounding.
- The documentation must say that the exactness tolerance (OKLab 0.002) and the approximation tolerance (CIEDE2000) are
  different measures.

## Evidence

- Tailwind 3 palette against the nearest Tailwind 4 colour: median ΔE2000 0.72, p90 2.6. 237 of 297 colours (80%) are
  within ΔE 2 of some Tailwind 4 colour, but only 180 of those are the colour with the same name. An approximate mode
  therefore maps about 20% of v3 colours to a differently named v4 colour, which is why every approximation is
  reported.
- Of 8,801 utility names that exist in both versions, 3,264 differ only in palette; 1,870 of those are within OKLab
  0.01, and 1,394 are different colours.
- Clipping an `oklch()` input that equals a Tailwind 4 palette entry flagged it as approximate, which is what the
  unclipped comparison fixes.
