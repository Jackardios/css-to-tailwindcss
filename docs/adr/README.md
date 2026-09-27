# Architecture decision records

These records explain why css-to-tailwindcss 2.0 is built the way it is. Each one states the problem, the decision, what
follows from it, and the measurements behind it, so that a later change can be argued against the same evidence.

## Format

Every record has the same sections:

- **Status:** `Proposed`, `Accepted`, `Superseded by ADR-N` or `Deprecated`.
- **Context:** the problem and the constraints.
- **Decision:** what we do.
- **Consequences:** what follows, including the costs.
- **Evidence:** measurements and experiments, with the versions they ran on. Numbers marked *estimate* were not measured.
- **Alternatives:** what was rejected and why (when there was a real choice).

A record is changed only while it is `Proposed`. After that a new record supersedes it.

## Measurement setup

Unless a record says otherwise:

- Tailwind **3.4.19** and **4.3.3** installed side by side as npm aliases;
- Apple M1 Pro, Node 22.17;
- timings from an esbuild bundle (not from `--experimental-strip-types`), median of 3 fresh processes, at load average
  6–8;
- the "sample" is 185 single declarations and 14 multi-declaration rules (199 cases); the "held-out set" is 70 single
  declarations and 8 rules (78 cases), written after the sample was tuned and evaluated once;
- the "browser oracle" renders the input CSS and the Tailwind output in Chromium and compares `getComputedStyle` of the
  element, its `::before`/`::after` and a child that shows inherited properties.

Some early prototype timings were taken on a heavily loaded machine (load average 45–220). Those are marked as upper
bounds; ratios between strategies measured in the same run are still valid.

## Index

| # | Decision | Status |
|---|---|---|
| [1](0001-adapter-primitives.md) | The Tailwind adapter exposes primitives; the engine makes every decision | Proposed |
| [2](0002-lazy-sharded-index.md) | Utilities are indexed lazily, in shards by utility root | Proposed |
| [3](0003-canonicalize-as-test-oracle.md) | `canonicalizeCandidates` is a test oracle, not a matcher | Proposed |
| [4](0004-probe-map-cache.md) | The probe map is cached and shipped precomputed | Proposed |
| [5](0005-self-verification.md) | Every result is verified by compiling it; doubt means refusal | Proposed |
| [6](0006-side-effect-kinds.md) | Side effects and approximations are closed lists | Proposed |
| [7](0007-colour-comparison.md) | Colours are compared in OKLab; approximation is opt-in | Proposed |
| [8](0008-solver-objective.md) | The solver prefers fewer arbitrary values, then fewer classes | Proposed |
| [9](0009-bare-values.md) | Tailwind decides which bare values are valid | Proposed |
| [10](0010-preflight-awareness.md) | Conversion knows whether preflight is present | Proposed |
| [11](0011-variant-matching.md) | Variants are matched against a table built by compiling | Proposed |
| [12](0012-package-layout.md) | Package layout, module formats and runtime requirements | Proposed |
| [13](0013-tailwind-3-internals.md) | Tailwind 3 is driven through its internal modules | Proposed |
| [14](0014-rule-ir-and-placement.md) | Rules become an anchor, a context and declarations; placement is a plan | Proposed |
| [15](0015-branches-and-releases.md) | Branches, release channels and the 2.0 cutover | Proposed |
| [16](0016-api-contract.md) | Call contract: sync conversion, results, diagnostics and errors | Proposed |
| [17](0017-html-mode.md) | HTML mode is a separate, experimental entry point | Proposed |
| [18](0018-oracle-independence-and-gates.md) | Test oracles are independent of the product; milestones end at gates | Proposed |
| [19](0019-security.md) | Code execution, resources and supply chain | Proposed |
| [20](0020-behaviour-policies.md) | Behaviour policies for cases with more than one reasonable answer | Proposed |
| [21](0021-invalid-input.md) | Invalid input is preserved, never converted to another property | Proposed |

All records are `Proposed` until gate G0 (ADR-18). The pull request that accepts them sets them to `Accepted`.
