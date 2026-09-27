# ADR-6: Side effects and approximations are closed lists

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Idiomatic output sometimes needs a utility that does slightly more or slightly less than the input: `text-sm` also sets
`line-height`, `transition-colors` also sets a duration, TW4 `hover:` adds `@media (hover: hover)`. Users need to know
when that happens, and `strict` users need to exclude it. An open-ended "close enough" rule would make verification
(ADR-5) meaningless.

## Decision

Verification accepts a non-exact result only when every difference belongs to a listed kind. There are two lists.

**`SideEffectKind`** — the utility does something in addition to the input:

| Kind | Example |
|---|---|
| `font-size-line-height` | `font-size:14px` → `text-sm` also sets `line-height` |
| `transition-defaults` | `transition-property` utilities add a duration and timing function |
| `hover-media` | TW4 `hover:` adds `@media (hover: hover)` |
| `font-smoothing-pair` | `antialiased` also sets `-moz-osx-font-smoothing` |
| `forced-colors` | TW4 `outline-hidden` adds a `forced-colors` block |
| `variant-adds-property` | `before:`/`after:` add `content: var(--tw-content)` |
| `preflight-default` | TW4 `border` sets `border-style: solid`, which preflight already sets |

**`ApproximationKind`** — the result differs from the input within a stated tolerance or assumption:

| Kind | Example |
|---|---|
| `color-delta` | colour within the `approximate` ΔE (opt-in, ADR-7) |
| `length-delta` | length within the `approximate` px tolerance (opt-in) |
| `color-gamut` | colour matched after clipping to sRGB |
| `line-height-inheritance` | TW4 unitless line-height where the input is in px, same used value |
| `transform-longhands` | TW4 `rotate:`/`scale:` properties instead of one `transform` |
| `radius-full` | `9999px` vs `calc(infinity * 1px)` |
| `dead-longhand` | a longhand with no visible effect is not reproduced |
| `media-type-dropped` | `@media screen and (…)` → `sm:` (ADR-20) |
| `writing-mode-assumed` | physical properties matched by logical utilities (ADR-20) |

Rules:

- Every accepted side effect or approximation is reported (`side-effect` or `approximated` diagnostic with the kind).
- `strict` accepts only exact results. `preflight-default` is assigned only when the adapter's baseline sets the same
  value (ADR-10), so it counts as exact.
- A new kind needs a unit test and a browser-oracle case. Adding a kind is a minor release (ADR-16).

## Consequences

- "Idiomatic" has a precise meaning that the docs can list.
- Output that `strict` refuses still has an exact alternative in most cases (arbitrary values, `[&:hover]:`).

## Evidence

- On the 199-case sample the prototype produced 4 side-effect and 9 approximated results on Tailwind 4, 4 and 2 on
  Tailwind 3. All were confirmed by the browser oracle.
- The earlier draft had 12 kinds in one list with `relies-on-preflight` among them; that is now a separate diagnostic
  (ADR-10), and `media-type-dropped` and `writing-mode-assumed` were added by the behaviour policies (ADR-20).
