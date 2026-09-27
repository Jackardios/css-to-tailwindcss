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
- **Value-directed families.** A family whose classes output a plain theme colour, or only set variables (shadow, ring,
  drop-shadow and similar colours), is not compiled as part of its shard. For an input colour the engine looks up the
  theme tokens within OKLab 0.004 of it (or of its opaque part), and compiles only `root-token` for the roots that set
  the target property. Final acceptance still uses the exactness rule of ADR-7. The adapter exposes the theme tokens
  (`themeTokens()`, ADR-1).
  - A palette name that is also a non-colour token (`black` as a font weight) is not treated as a colour.
  - A family whose probe sample outputs a composite value (TW4 `mask-*`) stays in its shard.
- **Composition of variable-only utilities** (gradient stops, ring and ring offset, shadow colours, inset shadows,
  drop-shadow and text-shadow colours) is a generic engine stage, with no code per family. In 2.0 it is **opt-in**
  (`compose`). It becomes the default once its per-family analysis is cached with the probe map (ADR-4). A composition
  that would contain an arbitrary class is rejected in favour of one arbitrary property.

## Consequences

- Cold start is the probe plus the shards the first rules touch (ADR-4 caches the probe).
- The first time a shard is touched, that rule is slower than the rest; the budget is ≤ 50 ms. After the
  value-directed lookup the slowest first touches are the `margin` and `inset` shards (about 14–28 ms).
- Bare-value classes that `classList()` omits (TW4 `bg-linear-135`, `ring-3`) are invisible to the index and to the
  composer; the adapter has to add them, as it already does for other omitted forms.
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

**Value-directed lookup (spike S2).** 17 colour and shadow cases, a fresh process per case, 3 runs, load average 9–11:

| | Before: median / p90 / max | After: median / p90 / max | Worst case, classes compiled |
|---|---|---|---|
| TW3 | 16.4 / 105.9 / 111.3 ms | 1.34 / 5.16 / 6.95 ms | 1,770 → 62 |
| TW4 | 9.9 / 53.9 / 57.5 ms | 1.45 / 4.16 / 5.58 ms | 2,078 → 76 |

- Output identical to the full-shard approach on 1,918 of 1,918 conversions in 6 configurations (default theme, custom
  theme, prefix; TW3 and TW4). An audit compiled every class kept out of the shards and found 0 that the lookup would
  have missed.
- On the 199-case sample: building the palette costs 11–13 ms; cold total falls from 625 to 453 ms (TW3) and from 653
  to 504 ms (TW4); heap falls by 13–16 MB; about half as many classes are compiled.

**Composer (spike S2).** 32 inputs per adapter:

| | Named composition | Arbitrary | Leftover | Without the composer (named) |
|---|---|---|---|---|
| TW3 | 21 | 11 | 0 | 1 |
| TW4 | 25 | 7 | 0 | 0 |

- Examples: `bg-gradient-to-r from-red-500 via-yellow-500 via-30% to-blue-500`,
  `ring-2 ring-offset-2 ring-offset-gray-900 ring-indigo-500`, TW4 `drop-shadow-lg drop-shadow-red-500`.
- All 45 named outputs match the input in Chrome screenshots within 1/255 per channel.
- Cost: the first composition of a family in a fresh process takes 15–24 ms (TW3) and 33–69 ms (TW4), of which TW4
  spends 13–16 ms once on building units and 20–27 ms per family on analysis that does not depend on the input. A repeat
  takes about 0.1 ms. Enabled by default, it raised the TW4 first rule from 22 to 41 ms without changing any output,
  which is why it is opt-in until cached.
- Bundle: value lookup and composer add 6 KB gzip (core + TW4 144 KB).

## Alternatives

- **Eager index.** Same output, about 3× slower to the first rule and 2.5× the heap for TW4.
- **`canonicalizeCandidates` as the matcher, or as a second pass.** See ADR-3.
