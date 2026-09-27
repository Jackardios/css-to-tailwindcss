# ADR-12: Package layout, module formats and runtime requirements

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

The converter runs in Node (CLI, codemods, MCP servers), in a VS Code extension bundled by esbuild into CommonJS, and in
browsers (transform.tools, playgrounds). Version 1 ships CommonJS only, has no `exports` map (so every `lib/*` file is
public), and pins its own copy of Tailwind 3.2.

## Decision

**Entry points:**

| Specifier | Runs in | Contents |
|---|---|---|
| `css-to-tailwindcss` | anywhere | `createConverter`, types, `CssToTailwindError`, `isCssToTailwindError`, diagnostic helpers |
| `css-to-tailwindcss/tailwind4` | anywhere | `tailwind4({ css, base, loadStylesheet, loadModule, tailwindcss })`, `stylesheetsFromMap()` |
| `css-to-tailwindcss/tailwind4/node` | Node | `tailwind4()` with file-system loaders |
| `css-to-tailwindcss/tailwind3` | Node; browser only with injected internals | `tailwind3({ config, cwd, tailwindcss })` |
| `css-to-tailwindcss/node` | Node | `loadTailwind()`: finds the user's `tailwindcss` and entry or config |
| `css-to-tailwindcss/html` | anywhere | `convertHTML()`, experimental (ADR-17) |
| bin `css-to-tailwindcss` | Node | CLI |

**Formats and requirements:**

- Dual ESM and CommonJS output, ES2022, `exports` map, `sideEffects: false`. Library entries use no top-level await.
- **Library code never uses `import.meta.url`.** Paths come from an explicit `base` or `cwd`, defaulting to
  `process.cwd()`.
- `tailwindcss` is an optional peer dependency, `^3.4 || ^4.1` (ADR-1, ADR-13). Both factories also accept an injected
  `tailwindcss` module, for bundles and for tests with version aliases.
- Node ≥ 22.12. The build runs on Node 24.
- Core dependencies: postcss, postcss-safe-parser, postcss-value-parser, postcss-selector-parser, culori (tree-shaken).
  `/html` adds parse5, css-select and specificity, which never reach the core.
- Budget: core plus the Tailwind 4 adapter ≤ 150 KB gzip.

## Consequences

- Node-only code (file loaders, config discovery) stays out of browser bundles, and each subpath has one set of types.
  Export conditions were rejected because TypeScript resolves one `types` target per subpath, and the Node and browser
  factories take different options.
- Deep imports into `lib/*` stop working; this is listed in the migration guide.
- Node 22 reaches end of life on 2027-04-30; the docs say so.
- A smoke test bundles the packed tarball with esbuild to CommonJS, like the extension does.

## Evidence

- Browser bundle of the prototype (facade, TW4 adapter, postcss, postcss-selector-parser, culori): 493 KB minified,
  **139 KB gzip**; 313 ms to the first converted rule in Chromium. The only Node builtins are inside the default
  file loader, which is never called when `loadStylesheet` is injected.
- esbuild bundling to CommonJS (as the extension does) resolves the `import` condition and leaves `import.meta.url`
  empty. The adapter then failed with "The argument 'filename' must be a file URL object … Received undefined", with no
  build warning. Passing `base` fixed it.
- `require()` of an ESM-only package fails on Node 20.15 and 22.11 and prints an `ExperimentalWarning` on 22.12.0; dual
  output works on all of them. Top-level await in ESM breaks `require()` with `ERR_REQUIRE_ASYNC_MODULE`.
- A toy package with these subpaths built by tsdown 0.23 generated the `exports` map; publint reported only a
  `sideEffects` suggestion, and attw was green for node16 CJS, node16 ESM and bundler resolution.
- tsdown requires Node ≥ 22.18; VS Code 1.101 ships Node 22.15.1, which meets the ≥ 22.12 runtime requirement.
