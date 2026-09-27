# ADR-4: The probe map is cached and shipped precomputed

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

The probe (ADR-2) is the largest part of the cold start on Tailwind 4. The cold-start budget is 300 ms in Node.

The probe's result, the map from property key to utility roots, depends on the set of roots and their value families,
not on theme values. Two projects with the stock Tailwind 4.3 root set and different themes produce the same map.

## Decision

- The probe map is computed at runtime and memoized per Tailwind handle.
- Precomputed maps are generated in CI for each supported Tailwind minor and shipped in the package. Each map is keyed
  by a hash of the root list, the value families and the plugin list. When the hash of the loaded setup does not match,
  the map is computed at runtime.
- The same cache holds the colour palette, the set of value-directed families (ADR-2) and, once the composer is on by
  default, its units and per-family analyses.
- This is required in the first end-to-end milestone (M3), not an optimization for later.
- A persistent on-disk cache is not part of 2.0.
- The shipped maps are derived from MIT-licensed Tailwind data; the package carries the notice.

## Consequences

- Budget: ≤ 300 ms to the first rule with a matching map, ≤ 450 ms without.
- Custom plugins and `@utility` change the hash, so those setups always pay for the probe, and stay correct.
- The CI job that generates the maps must run for every supported minor; a stale map is harmless (hash mismatch) but
  slow.

## Evidence

- The probe is 57–62% of the Tailwind 4 time to first rule: probe 217–234 ms of 359–380 ms (bundled build).
- The probe compiles about 2,100 utilities in Tailwind 4 and 1,100 in Tailwind 3.
- *Estimate:* 140–160 ms to the first rule on Tailwind 4 with the probe skipped.
- The composer's Tailwind 4 setup is 13–16 ms once plus 20–27 ms per family, independent of the input (spike S2);
  caching it makes the first composition cost about as much as a warm one (1–10 ms).
