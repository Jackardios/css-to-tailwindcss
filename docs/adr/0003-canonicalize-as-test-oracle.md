# ADR-3: `canonicalizeCandidates` is a test oracle, not a matcher

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Tailwind 4 has `designSystem.canonicalizeCandidates(candidates, { collapse })`, which rewrites a class list into its
preferred form, for example `[margin-top:16px]` into `mt-4`. It looks like a ready-made converter.

## Decision

- The converter does not call `canonicalizeCandidates` at runtime.
- Tests use it as an oracle on Tailwind 4: `canonicalize(ours)` must equal `ours`, or the difference must be a recorded
  preference.
- One of its preferences is adopted: `filter-[…]` is preferred to `[filter:…]`.

## Consequences

- No runtime dependency on a Tailwind 4 API that appeared in 4.1.15 (with `collapse` working from 4.1.16).
- A cheap, independent check of naming quality on every Tailwind 4 test run.

## Evidence

- Quality on the 199-case sample: 118 named and 81 arbitrary, against 175 and 24 for the lazy index (ADR-2). It works
  on candidates, so it does not decompose shorthands or pick a set of classes; `width:16rem`, `color:white`,
  `font-weight:bold`, `border-width:1px` and transforms stay arbitrary.
- Cost: the first call took 1.26–1.39 s in Chromium and 3.2–3.4 s of CPU in Node (on a loaded machine); heap 203 MB
  warmed.
- As an oracle, `canonicalize(ours) === ours` held on 198 of 199 cases. The exception was
  `[filter:brightness(1.5)_blur(4px)]` → `filter-[…]`.
- A hybrid (lazy index, then canonicalize on anything arbitrary) produced output identical to the lazy index on 199/199
  and cost about 4 s more.
