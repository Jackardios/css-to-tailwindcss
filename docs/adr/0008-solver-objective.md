# ADR-8: The solver prefers fewer arbitrary values, then fewer classes

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

A rule can usually be covered by several class sets. For example Tailwind 3
`outline: 2px solid #93c5fd; outline-offset: 2px` is exactly `outline-none outline-blue-300`, because `outline-none` is
`2px solid transparent` with offset 2px. The alternative `outline outline-2 outline-offset-2 outline-blue-300` has more
classes but none that overrides another. The solver needs one ordering.

## Decision

- The solver minimizes, in this order: the number of arbitrary values, the number of classes, the number of overridden
  parts, the total length.
- Solutions with overridden parts are reported with `overlapping-classes`.
- The bounded search stops at 50,000 visited nodes; a test pins the limit (ADR-19).
- This is revisited when the solver gets branch-and-bound pruning. An `avoidOverrides` option may be added then.

## Consequences

- Output is short and idiomatic, and sometimes reads oddly; the diagnostic makes it visible.

## Evidence

- Putting overrides before the class count changed 1 of 199 sample outputs and 1–3 of 78 held-out outputs. It fixed the
  `outline-none` case and turned one transition side effect into an exact result.
- Without length pruning the depth-first search hit the 50,000-visit cap, and a Tailwind 4 border case regressed to
  `border border-2 border-transparent`.
