# ADR-18: Test oracles are independent of the product; milestones end at gates

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Most 1.x tests compare output strings, so they encode what the author believed. A differential harness against real
Tailwind found four bugs that the suite asserted as correct. Version 2 is also a long project (roughly 80–120 focused
days); without explicit exit criteria it can drift or ship half-done.

## Decision

**Oracles.**

- The semantic oracle compiles the output with real Tailwind, resolves the cascade, and compares effective declarations
  with the input run through the same Tailwind.
- The oracle does not import `src/` (enforced by lint). Its normalizer is separate from the product's, and it is itself
  checked against Chromium.
- A browser oracle (Playwright, Chromium nightly; Firefox and WebKit weekly) compares computed styles, with states
  substituted by classes and real-interaction probes for pseudo-element plus state combinations.
- Known, allowed differences are recorded as an executable classifier; a new difference shows up as "unclassified".
- Shared case files run every case on both adapters; a case is blessed only after the oracle accepts it.

**Gates.** Each milestone ends at a gate that can be checked by running something.

| Gate | Criteria |
|---|---|
| G0 | ADRs accepted. Spike S1 reproduces the 30 cascade inputs with the oracle green on TW3 and TW4, or this set of ADRs records the design change. Spike S3 decides on HTML mode |
| G1 | The oracle agrees with Chromium on 100% of its self-check table. The 1.1.2 baseline scorecard is committed. Adapter contract tests are green on the PR matrix. The oracle has no `src/` imports |
| G2 | The corpus runs end to end on both adapters with 0 oracle failures. Package tests are green. Prereleases start only after this gate |
| G3 | 0 undeclared differences on all cases and the corpus, both adapters, preflight on and off. Browser: 0 false accepts, flaky rate under 1% over 7 nights. Against 1.1.2: every difference classified, 0 regressions, a share of exact or declared conversions at least 1.1.2's per file, a share of arbitrary values at most 1.1.2's |
| G4 | Everything in G3 on the full scope. Performance budgets met, bundle ≤ 150 KB gzip, mutation score ≥ 85% on the core and engine, publint, attw and `npm audit --omit=dev` clean, no pending cases (or each moved to 2.x with an issue), `MIGRATION.md` covers every breaking change |
| G-HTML | At least 10 HTML pages: 0 browser differences at 4 viewport widths and in forced states, converting the output again changes nothing, and the CLI `--html` smoke test passes |
| G5 | At least 14 days on the last prerelease without a P0 or P1 fix, the VS Code extension works on the release candidate, nightly jobs green for 7 days, the cutover checklist (ADR-15) done |

**Performance budgets** (bundled build, heap measured with `heapUsed` after GC):

| Metric | Budget |
|---|---|
| Cold start to the first rule, Node | ≤ 300 ms with the probe map (ADR-4); ≤ 450 ms without |
| Cold start, browser | ≤ 400 ms |
| Warm path | median ≤ 0.5 ms per rule, p95 ≤ 5 ms |
| First touch of a shard | ≤ 50 ms (spike S2 measured a 7 ms maximum for colours and shadows) |
| Heap after GC | ≤ 100 MB |
| Linearity | t(32k rules) / t(16k rules) ≤ 2.3 |
| Core + Tailwind 4 adapter | ≤ 150 KB gzip |

## Consequences

- Test infrastructure (M2) comes before the end-to-end pipeline (M3).
- A gate that fails stops the next milestone or triggers the planned cut (for example HTML mode moves to 2.1).

## Evidence

- In the 1.x suite, the expectations for two of the four differential-test bugs asserted the buggy output (the
  `!important` merge and the `animate-spin` snapshot).
- The differential harness found those bugs by recompiling without Tailwind's rule merging, which the oracle now does
  by design.
- The prototype's browser oracle found 0 false accepts in 1,338 pairs; its held-out run found five normalizer gaps and
  one data-loss bug on the first try (ADR-5).
