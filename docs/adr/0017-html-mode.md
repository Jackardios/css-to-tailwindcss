# ADR-17: HTML mode is a separate, experimental entry point

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Converting an HTML page with its CSS into class attributes is a frequent request. It is much harder than CSS mode:
moving declarations from rules into classes throws away specificity and source order, and Tailwind's utility order
decides instead.

## Decision

- `convertHTML(converter, html, options)` lives in `css-to-tailwindcss/html`, so parse5 and css-select never reach the
  core.
- It is **experimental** and outside semver until the flag is removed. It ships in 2.0 only if it passes gate G-HTML
  (ADR-18) by feature freeze; otherwise it ships in 2.1 as a minor release.
- **Input:** a static document or fragment, its `<style>` blocks, and external stylesheets passed in `stylesheets` that
  belong to this document only. A `<link rel=stylesheet>` that is not supplied gives `html-unknown-stylesheet`, and
  `strict` refuses the conversion.
- **Rules:** only rules with a class anchor (ADR-14) are converted. css-select is used only to find every rule that may
  match an affected element; dynamic pseudo-classes are removed and assumed true.
- **Per-element cascade:** pairs of (rule, longhand) that share an element form a component. A component is converted
  as a whole or not at all, and only if, for every element and context, the winning declaration after conversion
  (compiled utilities in their layer or order, leftover CSS unlayered) equals the one before. Otherwise it stays CSS
  with `cascade-conflict`.
- **Layers:** the adapter reports `utilitiesLayered`; for Tailwind 3 the option `tailwindStylesheet: 'before' | 'after'`
  states where the Tailwind stylesheet is loaded.
- **Edits in place:** only `class` attribute values and `<style>` bodies change, at the source offsets parse5 reports.
  The document is never re-serialized.
- Original class names are kept by default (`keepClassNames: true`). `style=""` attributes are converted only with
  `styleAttributes: true`. `<template>`, `<noscript>`, `<svg><style>` and scripts are skipped; scripts give
  `html-scripts-present`.
- **Out of scope:** templates (JSX, Vue and others use `output: 'classes'`), shadow DOM, fetching remote stylesheets.

## Consequences

- The mode refuses a lot on purpose. It is correct on what it converts, or it does not ship.
- It needs a page-level browser oracle (computed styles of every element, at several viewports and forced states).

## Evidence

- Naive per-rule transfer changed rendering in 3 of 4 cascade probes in Chromium with Tailwind 4.3.3:
  `#x.a{color:green} .a:hover{color:blue}` (hover turned blue), `div > .a{color:green} .a{color:red}` (red won by
  utility order), `.a{margin-top:8px} .b{margin-top:4px}` (8px won). Only the `!important` probe matched.
- css-select cannot match pseudo-elements, and a state pseudo-class never matches statically.
- A `dom-serializer` round trip rewrote attribute quoting and whitespace; parse5 source locations allow surgical edits
  that keep everything else byte for byte.
- Spike S3 (three real pages plus an adversarial page, per-element verification, browser oracle): results and the
  go/no-go for 2.0 are added here before this record is accepted.
