# ADR-2: Utilities are indexed lazily, in shards by utility root

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

To find utilities for a declaration, the engine needs to know what each utility does. Tailwind 4.3 has about 23,300
utilities and Tailwind 3.4 about 11,300. Compiling all of them before the first conversion is too slow for an editor
command and uses too much memory. Tailwind 4's own `canonicalizeCandidates` is slower still and gives worse results
(ADR-3).

## Decision

- A **probe** compiles every static utility plus one sample per value family (number, fraction, colour, each keyword)
  of every functional root. It produces a map from normalized property key to the roots that can set it.
- A **shard** is all classes of one root. It is compiled and indexed the first time a declaration needs one of its
  keys, and kept for the life of the Tailwind handle.
- Colour and shadow shards are large. For them the engine looks up candidates by **value**: it finds the theme tokens
  whose value is within tolerance of the input, and compiles only those. (Design and numbers: spike S2, recorded below
  when it finishes.)

## Consequences

- Cold start is the probe plus the shards the first rules touch (ADR-4 caches the probe).
- The first time a large shard is touched, that rule is slower than the rest. The budget for that is ≤ 50 ms with the
  value-directed lookup, ≤ 150 ms without it.
- Output does not depend on which shards happen to be loaded; a property-based test checks that conversion is
  deterministic and independent of call history.

## Evidence

Sample of 199 cases, both versions:

| | Named | Arbitrary | Leftover | Same output as eager |
|---|---|---|---|---|
| TW4 lazy | 175 | 24 | 0 | 199/199 |
| TW4 `canonicalizeCandidates` | 118 | 81 | 0 | 126/199 |
| TW3 lazy | 186 | 13 | 0 | 199/199 |

The probe misses 0 key-to-root pairs compared with the eager index.

Bundled build, 3 fresh processes:

| | Time to first rule | Unseen rule median / p90 / max | Warm median / max | Heap after GC |
|---|---|---|---|---|
| TW4 lazy | 359–380 ms | 0.09 / 1.3–1.6 / 53–56 ms | 0.04 / 1.9 ms | 48 MB |
| TW3 lazy | 302–320 ms | 0.11 / 1.3–1.8 / 93–97 ms | 0.05 / 2–3.3 ms | 49 MB |
| TW4 eager | 1,055–1,091 ms | 0.05 / 0.3–0.4 / 3.8 ms | 0.04 / 2.3 ms | 119 MB |
| TW3 eager | 751–758 ms | 0.07 / 0.4 / 4.2 ms | 0.05 / 3.7 ms | 66 MB |

- Largest shards in TW4: `shadow` 1,190 classes, `border-t` colours 888. Most roots have fewer than 100 classes.
- The maximum unseen-rule times above are first touches of colour and shadow shards.

## Alternatives

- **Eager index.** Same output, about 3× slower to the first rule and 2.5× the heap for TW4.
- **`canonicalizeCandidates` as the matcher, or as a second pass.** See ADR-3.
