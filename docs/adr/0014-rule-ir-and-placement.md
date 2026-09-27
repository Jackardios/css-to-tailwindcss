# ADR-14: Rules become an anchor, a context and declarations; placement is a plan

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Version 1 mutates the postcss tree while it walks it: it moves declarations into `@apply`, creates rules and merges
them. That makes the order of operations part of the semantics, and it is quadratic on large files. Several bugs in
1.x came from this: rules lost when a pseudo-class rule had no base rule, `@media` rules merged across intermediate
rules, `!important` lost when Tailwind merged adjacent rules. Some cases were deferred to 2.0 because the mutable
model could not express them safely:

- adjacency that appears after intermediate rules are removed;
- identical adjacent `@media` blocks, which Tailwind merges;
- `width: 13px !important; width: 4px` in one rule.

## Decision

**Rule model (CSS mode).**

- Each selector of a selector list becomes a separate `RuleIR { anchor, context, declarations }`.
- `anchor` is one class. `context` is the at-rule chain plus the rest of the selector relative to the anchor
  (`.card > h2` → anchor `card`, context `& > h2`), which becomes variants (ADR-11).
- A selector without a single class anchor is `unsupported-selector` and stays CSS.
- Parsing does not mutate the input.

**Placement.** The v1 placement algorithm (cascade-preserving merge, the fixpoint for `!important` and leftover
declarations) is ported as a pure function from the list of `RuleIR` results to a placement plan. Its inputs change:

- which properties a utility really sets and its side effects come from compiling (ADR-5), not from the input
  declaration;
- cascade order comes from `adapter.order()`, called once per plan;
- whether `@apply` in the same file copies rules (Tailwind 3 does) is an adapter fact.

A linear renderer then writes the output:

- `output: 'apply'`: `@apply` in place, optionally with `@reference` for Tailwind 4;
- `output: 'classes'`: a class list per anchor and the leftover CSS. In Tailwind 4 utilities live in
  `@layer utilities` and lose to **any** unlayered leftover rule, so a property (with its overlapping longhands) that
  stays CSS in any context of an anchor stays CSS in all of them.

HTML mode needs a per-element model instead; see ADR-17.

## Consequences

- Placement can be tested as data (plan in, plan out) without postcss.
- The renderer only touches the nodes it changes, which makes the formatting invariant possible (ADR-20).
- If the port does not fit the IR, the fallback is conservative placement: no merging across rules, and anything
  doubtful stays CSS.

## Evidence

- Version 1.1.1 on flat stylesheets of `.cN:hover{color:red}`: 91 ms for 2,000 rules, 286 ms for 8,000, 2,388 ms for
  32,000 and 7,308 ms for 64,000 (×8.4 for ×4 rules). The profile is dominated by postcss `insertBefore`,
  `removeChild` and `index` (about 56% together), each an O(n) operation on the root's children during the walk.
- In Tailwind 4, `[margin-block:2px]` sorts before `mt-4` (arbitrary properties sort by property, not last), so
  `.a{margin-top:16px; margin-block:2px}` → `@apply [margin-block:2px] mt-4` inverts the source cascade. In Tailwind 3
  the same output is correct. The order must come from the adapter.
- Spike S1 (placement and both renderers on this model, 30 cascade inputs from the 1.x test suite, compile oracle on
  Tailwind 3 and 4): results are added here before this record is accepted.
