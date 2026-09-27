# ADR-9: Tailwind decides which bare values are valid

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Tailwind 4 derives spacing from one `--spacing` variable and accepts any multiple: `mt-3.25` is `13px` with the default
theme. Tailwind 3 accepts only theme keys. Some teams want only theme steps in their markup.

## Decision

- The engine infers linear scales from data (a sample class's value divided by its key) and proposes bare values.
  A bare value is used only if Tailwind compiles it and verification (ADR-5) accepts it.
- Option `bareValues: boolean`, default `true`. With `false`, only theme keys or arbitrary values are used. It has no
  effect on Tailwind 3, which has no bare values.

## Consequences

- Tailwind 4 output avoids arbitrary values for off-scale spacing (`mt-3.25` instead of `mt-[13px]`).
- No hand-written list of which utilities accept bare values.

## Evidence

- `mt-3.25` and `w-30.75` compile on every Tailwind 4 version from 4.0.0 to 4.3.3. Tailwind 3 rejects them, and the
  engine falls back to `mt-[13px]`.
