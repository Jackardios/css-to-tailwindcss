import {
  TailwindConverter,
  TailwindConverterConfig,
} from '../src/TailwindConverter';
import { convert, normalizeCSS } from './helpers/convert';

/**
 * Regression tests for the issues found by the audit, the IDs refer to the audit report.
 * Every conversion result is also compiled by Tailwind to make sure that all classes exist.
 */
describe('regressions', () => {
  describe('lost rules and crashes', () => {
    it('F1: keeps a rule with a variant when there is no base rule before it', async () => {
      expect(await convert('.foo:hover { color: red }')).toBe(
        normalizeCSS('.foo { @apply hover:text-[red]; }')
      );
    });

    it('F1: keeps both rules when the base rule follows the variant rule', async () => {
      expect(
        await convert('.a:hover { color: red } .a { display: block }')
      ).toBe(
        normalizeCSS('.a { @apply hover:text-[red]; } .a { @apply block }')
      );
      expect(
        await convert(
          '.a:hover { color: red } .b { color: green } .a { color: blue }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply hover:text-[red]; } .b { @apply text-[green] } .a { @apply text-[blue] }'
        )
      );
    });

    it('F1: keeps variant rules followed by a media query', async () => {
      expect(
        await convert(
          '.a:focus { color: red } @media (min-width: 768px) { .a { display: block } }'
        )
      ).toBe(normalizeCSS('.a { @apply focus:text-[red] md:block; }'));
    });

    it('F1: keeps variant rules of complex selectors', async () => {
      expect(await convert(':is(.a, .b):hover { color: red }')).toBe(
        normalizeCSS(':is(.a, .b) { @apply hover:text-[red]; }')
      );
    });

    it('F2, F3: does not touch keyframes', async () => {
      const keyframes =
        '@keyframes spin { 0% { transform: rotate(0deg) } 50% { opacity: .5 } 100% { transform: rotate(360deg) } }' +
        '@keyframes move { from { transform: translateX(0) } to { transform: translateX(10px) } }' +
        '@-webkit-keyframes fade { from { opacity: 0 } }';

      expect(await convert(`${keyframes} .a { display: block }`)).toBe(
        normalizeCSS(`${keyframes} .a { @apply block }`)
      );
    });

    it('does not touch rules inside non-style at-rules', async () => {
      const css =
        "@font-face { font-family: 'Foo'; font-weight: 400 } @page :first { margin: 1in }";

      expect(await convert(css)).toBe(normalizeCSS(css));
    });

    it('F4: converts only the own declarations of a rule with nested rules', async () => {
      expect(await convert('.a { color: red; .b { display: block } }')).toBe(
        normalizeCSS('.a { @apply text-[red]; .b { @apply block } }')
      );
    });

    it('F5: converts rules with selectors that cannot be parsed in place', async () => {
      expect(await convert('.a { color: red } &:hover { color: blue }')).toBe(
        normalizeCSS('.a { @apply text-[red] } &:hover { @apply text-[blue] }')
      );
    });

    it('F27: removes at-rules that became empty', async () => {
      expect(
        await convert('@media (min-width: 768px) { .a { color: red } }')
      ).toBe(normalizeCSS('.a { @apply md:text-[red]; }'));
    });
  });

  describe('semantics', () => {
    it('F6: converts aria and data attributes to aria-* and data-* variants', async () => {
      expect(
        await convert(
          '.a[aria-disabled="true"] { opacity: 0 }' +
            '.a[data-state="open"] { display: block }' +
            '.a[aria-expanded] { color: red }' +
            '.a[data-foo^="x"] { color: red }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply aria-disabled:opacity-0 data-[state=open]:block aria-[expanded]:text-[red]; }' +
            '.a[data-foo^="x"] { @apply text-[red] }'
        )
      );
    });

    it('F7: does not convert filter: opacity() to the opacity utility', async () => {
      expect(await convert('.a { filter: opacity(0.5) }')).toBe(
        normalizeCSS('.a { filter: opacity(0.5) }')
      );
    });

    it('F8: resolves the ambiguity of background-size and background-position', async () => {
      expect(
        await convert(
          '.a { background-size: 10px; background-position: 10px 20px }'
        )
      ).toBe(
        normalizeCSS('.a { @apply bg-[length:10px] bg-[position:10px_20px] }')
      );
    });

    it('F9: converts font-weight keywords and resolves the ambiguity with font-family', async () => {
      expect(
        await convert(
          '.a { font-weight: bold } .b { font-weight: normal } .c { font-weight: var(--w) }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply font-bold } .b { @apply font-normal } .c { @apply font-[number:var(--w)] }'
        )
      );
    });

    it('F10, F11: converts the border shorthand in any order', async () => {
      expect(
        await convert(
          '.a { border: none } .b { border: solid 1px } .c { border: 1px solid red }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply border-none } .b { @apply border border-solid border-current } .c { @apply border border-solid border-[red] }'
        )
      );
    });

    it.each([
      // the omitted parts of the shorthand are reset to their initial values
      ['border: solid red', 'border-[medium] border-solid border-[red]'],
      ['border: 2px dotted', 'border-2 border-dotted border-current'],
      // without a style the border isn't displayed
      // the width and the color are kept for a style set by other rules
      ['border: 1px red', 'border border-none border-[red]'],
      ['border: 1px', 'border border-none border-current'],
      ['border: 0', 'border-0'],
      ['border-right: none', 'border-r-0'],
      ['border-top: 1px solid', 'border-t-current border-t border-solid'],
    ])('F10, F11: converts %s exactly', async (declaration, classes) => {
      expect(await convert(`.a { ${declaration} }`)).toBe(
        normalizeCSS(`.a { @apply ${classes} }`)
      );
    });

    it.each([
      // `border-r-0` doesn't reset the style, the later width would make the border visible
      'border-right: 2px; border-right-width: 8px',
      // `border-none` doesn't reset the width and the color
      'border: none; border-style: solid',
      // Tailwind has no per-side border styles
      'border-bottom: 1px dashed red',
      'border: var(--border)',
      'border: inherit',
      'border-top: 1px solid var(--a, red) var(--b)',
    ])('F10, F11: leaves %s as is', async declaration => {
      expect(await convert(`.a { ${declaration} }`)).toBe(
        normalizeCSS(`.a { ${declaration} }`)
      );
    });

    it('F12: drops utilities overridden by a later shorthand', async () => {
      expect(await convert('.a { margin-top: 16px; margin: 8px }')).toBe(
        normalizeCSS('.a { @apply m-2 }')
      );
    });

    it('F13: keeps !important', async () => {
      expect(await convert('.a { color: red !important; margin: 8px }')).toBe(
        normalizeCSS('.a { @apply !text-[red] m-2 }')
      );
    });

    it('F13: puts the important modifier before the prefix', async () => {
      expect(
        await convert('.a:hover { margin-top: -16px !important }', {
          tailwindConfig: { content: [], prefix: 'tw-' },
        })
      ).toBe(normalizeCSS('.a { @apply hover:!tw--mt-4; }'));
    });

    it('F14: converts transforms only in the order Tailwind applies them', async () => {
      expect(
        await convert(
          '.a { transform: rotate(45deg) translateX(10px) } .b { transform: translateX(10px) rotate(45deg) }'
        )
      ).toBe(
        normalizeCSS(
          '.a { transform: rotate(45deg) translateX(10px) } .b { @apply translate-x-2.5 rotate-45 }'
        )
      );
    });

    it('F15: does not convert lists of transitions', async () => {
      expect(
        await convert(
          '.a { transition: opacity 0.3s ease, transform 0.3s ease } .b { transition: opacity 0.3s ease-in-out }'
        )
      ).toBe(
        normalizeCSS(
          '.a { transition: opacity 0.3s ease, transform 0.3s ease } .b { @apply transition-opacity duration-300 ease-[ease-in-out] }'
        )
      );
    });

    it('F16: converts prefers-color-scheme only when darkMode is "media"', async () => {
      const css = '@media (prefers-color-scheme: dark) { .a { color: white } }';

      expect(await convert(css)).toBe(
        normalizeCSS('.a { @apply dark:text-[white]; }')
      );
      expect(
        await convert(css, {
          tailwindConfig: { content: [], darkMode: 'class' },
        })
      ).toBe(
        normalizeCSS(
          '@media (prefers-color-scheme: dark) { .a { @apply text-[white] } }'
        )
      );
    });

    it('F17: does not convert a border shorthand partially', async () => {
      // Tailwind has no `ridge` style, `wavy` is invalid
      const css = '.a { border: 1px ridge } .b { border: 1px wavy red }';

      expect(await convert(css)).toBe(normalizeCSS(css));
    });

    it('F18: keeps variants of rules in non-convertible at-rules inside them', async () => {
      expect(
        await convert(
          '@media (min-width: 769px) { .foo::before { content: ""; display: block } }'
        )
      ).toBe(
        normalizeCSS(
          '@media (min-width: 769px) { .foo { @apply before:content-[""] before:block; } }'
        )
      );
    });

    it('does not use before/after variants overriding the content of the source', async () => {
      // `before:` utilities set `content: var(--tw-content)`
      expect(
        await convert(
          '.a::before { color: red } .b::before { content: "x"; content: attr(title) } .b:hover::before { color: blue }'
        )
      ).toBe(
        normalizeCSS(
          '.a::before { @apply text-[red] } .b::before { content: "x"; content: attr(title) } .b:hover::before { @apply text-[blue] }'
        )
      );
      expect(
        await convert(
          '.a::before { content: ""; color: red } .a:hover::before { color: blue }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply before:content-[""] before:text-[red] hover:before:text-[blue] }'
        )
      );
    });

    it('F30, F31: does not convert repeated or two-axis skew functions', async () => {
      expect(
        await convert(
          '.a { filter: blur(4px) blur(8px) } .b { transform: skew(10deg, 20deg) } .c { transform: skew(10deg) }'
        )
      ).toBe(
        normalizeCSS(
          '.a { filter: blur(4px) blur(8px) } .b { transform: skew(10deg, 20deg) } .c { @apply skew-x-[10deg] }'
        )
      );
    });
  });

  describe('invalid classes', () => {
    it('F19: supports nested functions', async () => {
      expect(
        await convert(
          '.a { transform: translateX(calc(100% - 10px)) } .b { filter: blur(calc(1px + 2px)) }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply translate-x-[calc(100%_-_10px)] } .b { @apply blur-[calc(1px_+_2px)] }'
        )
      );
    });

    it('F21: does not produce negative padding utilities', async () => {
      expect(
        await convert('.a { padding-top: -4px } .b { margin: -4px }')
      ).toBe(normalizeCSS('.a { @apply pt-[-4px] } .b { @apply -m-1 }'));
    });

    it('F28: checks the inset core plugin for top/right/bottom/left', async () => {
      expect(
        await convert('.a { top: 0; left: 0 }', {
          tailwindConfig: { content: [], corePlugins: { inset: false } },
        })
      ).toBe(normalizeCSS('.a { top: 0; left: 0 }'));
    });

    it('F29: checks the boxDecorationBreak core plugin', async () => {
      expect(
        await convert('.a { box-decoration-break: clone }', {
          tailwindConfig: {
            content: [],
            corePlugins: { boxDecorationBreak: false },
          },
        })
      ).toBe(normalizeCSS('.a { box-decoration-break: clone }'));
    });

    it('does not produce utilities for theme DEFAULT values without a utility', async () => {
      expect(
        await convert(
          '.a { transition-duration: 150ms; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1) }'
        )
      ).toBe(normalizeCSS('.a { @apply duration-150 ease-in-out }'));
    });
  });

  describe('new conversions', () => {
    it('F23: converts negative rem values', async () => {
      expect(await convert('.a { margin-top: -1rem }')).toBe(
        normalizeCSS('.a { @apply -mt-4 }')
      );
    });

    it('F24: converts font smoothing', async () => {
      expect(
        await convert(
          '.a { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale }'
        )
      ).toBe(normalizeCSS('.a { @apply antialiased }'));
    });

    it('F25: converts nth-child(odd) and nth-child(2n)', async () => {
      expect(
        await convert(
          '.a:nth-child(odd) { color: red } .b:nth-child(2n) { color: blue }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply odd:text-[red]; } .b { @apply even:text-[blue]; }'
        )
      );
    });

    it('F26: converts transform: none', async () => {
      expect(await convert('.a { transform: none }')).toBe(
        normalizeCSS('.a { @apply transform-none }')
      );
    });

    it('F32: converts seconds to theme values in milliseconds', async () => {
      expect(
        await convert(
          '.a { transition-duration: 0.3s; transition-delay: .15s }'
        )
      ).toBe(normalizeCSS('.a { @apply duration-300 delay-150 }'));
    });

    it('F33: converts flex keywords', async () => {
      expect(
        await convert(
          '.a { flex: auto } .b { flex: none } .c { flex: initial } .d { flex: 1 } .e { flex: 0 0 auto }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply flex-auto } .b { @apply flex-none } .c { @apply flex-initial } .d { @apply flex-1 } .e { @apply flex-none }'
        )
      );
    });

    it('converts opacity in percents', async () => {
      expect(await convert('.a { opacity: 50% }')).toBe(
        normalizeCSS('.a { @apply opacity-50 }')
      );
    });

    it('converts placeholder variants', async () => {
      expect(
        await convert(
          '.a::placeholder { color: red } .b:placeholder-shown { color: blue }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply placeholder:text-[red]; } .b { @apply placeholder-shown:text-[blue]; }'
        )
      );
    });
  });

  describe('cascade', () => {
    it('N1: keeps fallback declarations', async () => {
      expect(
        await convert(
          '.a { display: -webkit-box; display: flex } .b { height: 100vh; height: 100dvh }'
        )
      ).toBe(
        normalizeCSS(
          '.a { display: -webkit-box; display: flex } .b { height: 100vh; height: 100dvh }'
        )
      );
    });

    it('N3: drops parts of a shorthand overridden later', async () => {
      expect(
        await convert('.a { border-top: 1px solid red; border-color: blue }')
      ).toBe(normalizeCSS('.a { @apply border-t border-solid border-[blue] }'));
    });

    it('does not convert declarations following an unconverted overlapping one', async () => {
      expect(
        await convert(
          '.a { flex-flow: column; flex-wrap: wrap-reverse; display: block }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply block; flex-flow: column; flex-wrap: wrap-reverse }'
        )
      );
    });

    it('N4: does not produce arbitrary properties with empty values', async () => {
      expect(
        await convert('.a { color: ; }', { arbitraryPropertiesIsEnabled: true })
      ).toBe(normalizeCSS('.a { color: ; }'));
    });

    it('N5: does not merge into a distant rule if it changes the cascade', async () => {
      expect(
        await convert(
          '@media (min-width: 768px) { .a { margin: 8px } } .a { margin-top: 16px }'
        )
      ).toBe(normalizeCSS('.a { @apply md:m-2; } .a { @apply mt-4 }'));
    });

    it('N5: does not merge through rules setting the same properties', async () => {
      expect(
        await convert(
          '.a { color: red } .b { color: blue } .a:hover { color: green }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply text-[red] } .b { @apply text-[blue] } .a { @apply hover:text-[green]; }'
        )
      );
    });

    it('merges through rules setting other properties', async () => {
      expect(
        await convert(
          '.a { color: red } .b { margin: 0 } .a:hover { color: green }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply text-[red] hover:text-[green] } .b { @apply m-0 }'
        )
      );
    });

    it.each([
      // the remaining declaration of the base rule would be overridden by the moved utility
      [
        '.a { color: red; float: left } .a:hover { float: right }',
        '.a { @apply text-[red] float-left hover:float-right }',
      ],
      // utilities of different pseudo-elements don't compete
      [
        '.a::after { content: ""; color: red } .a::before { content: ""; color: red } .a:hover::after { color: blue } .a::before { color: green }',
        '.a { @apply after:content-[""] after:text-[red] before:content-[""] hover:after:text-[blue] before:text-[green] }',
      ],
      // a utility with an extra variant always wins
      [
        '.a:hover { color: red } .a:focus:hover { color: blue } .a:focus { color: green }',
        '.a { @apply hover:text-[red] focus:hover:text-[blue] focus:text-[green] }',
      ],
      // Tailwind emits `hover` before `focus`
      [
        '.a:hover { color: red } .a:focus { color: blue }',
        '.a { @apply hover:text-[red] focus:text-[blue] }',
      ],
      [
        '.a:focus { color: red } .a:hover { color: blue }',
        '.a { @apply focus:text-[red] } .a { @apply hover:text-[blue] }',
      ],
      [
        '.a:hover { color: red } .a:focus { color: blue } .a:hover { color: green }',
        '.a { @apply hover:text-[red] focus:text-[blue] } .a { @apply hover:text-[green] }',
      ],
      // there is no base selector to move the variant to
      [':hover { color: red }', ':hover { @apply text-[red] }'],
    ])('places the utilities of %s', async (css, expected) => {
      expect(await convert(css)).toBe(normalizeCSS(expected));
    });

    it.each([
      // `margin-inline-start` is `margin-right` with `direction: rtl`
      [
        '.a { margin-left: 8px; margin-inline-start: 4px }',
        '.a { @apply [margin-inline-start:4px] ml-2 }',
      ],
      [
        '.a { margin-left: 8px; margin-inline: 4px }',
        '.a { @apply [margin-inline:4px] ml-2 }',
      ],
      // arbitrary properties are emitted after all utilities
      [
        '.a { margin-inline-start: 4px; margin: 8px }',
        '.a { @apply [margin-inline-start:4px]; margin: 8px }',
      ],
    ])(
      'does not drop physical properties overridden by logical ones: %s',
      async (css, expected) => {
        expect(await convert(css, { arbitraryPropertiesIsEnabled: true })).toBe(
          normalizeCSS(expected)
        );
      }
    );

    it('treats logical properties as overlapping with all physical sides', async () => {
      // `margin-inline-start` is `margin-top` with `writing-mode: vertical-lr`
      expect(
        await convert('.a { margin-inline-start: 4px; margin-top: 8px }')
      ).toBe(normalizeCSS('.a { margin-inline-start: 4px; margin-top: 8px }'));
    });

    it('N6: does not convert declarations following an arbitrary property with overlapping properties', async () => {
      expect(
        await convert(
          '.a { grid-template-areas: "a b"; grid-template: none }',
          { arbitraryPropertiesIsEnabled: true }
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply [grid-template-areas:"a_b"]; grid-template: none }'
        )
      );
    });
  });

  describe('@apply conflicts', () => {
    it('does not apply a class in a rule with the same class', async () => {
      expect(
        await convert('.float-left { float: left } .m-2 { margin: 8px }')
      ).toBe(
        normalizeCSS(
          '.float-left { float: left } .m-2 { @apply mt-2 mr-2 mb-2 ml-2 }'
        )
      );
    });

    it('does not apply classes used by other rules of the file', async () => {
      // `@apply m-2` would also copy `.foo .m-2` to `.foo .a`
      expect(
        await convert(
          '.foo .m-2 { color: red } .foo .float-left { color: blue } .a { margin: 8px; float: left }'
        )
      ).toBe(
        normalizeCSS(
          '.foo .m-2 { @apply text-[red] } .foo .float-left { @apply text-[blue] } .a { @apply mt-2 mr-2 mb-2 ml-2; float: left }'
        )
      );
    });

    it('checks classes with variants', async () => {
      expect(
        await convert(
          '.a:hover { margin: 8px } .foo .hover\\:m-2 { color: red }'
        )
      ).toBe(
        normalizeCSS(
          '.a { @apply hover:mt-2 hover:mr-2 hover:mb-2 hover:ml-2 } .foo .hover\\:m-2 { @apply text-[red] }'
        )
      );
    });
  });

  describe('ambiguous arbitrary values', () => {
    it.each([
      ['font-size: inherit', '@apply text-[length:inherit]'],
      ['box-shadow: var(--shadow)', '@apply shadow-[shadow:var(--shadow)]'],
      ['border-width: inherit', '@apply border-[length:inherit]'],
      ['transition: inherit', 'transition: inherit'],
    ])('converts %s', async (declaration, expected) => {
      expect(await convert(`.a { ${declaration} }`)).toBe(
        normalizeCSS(`.a { ${expected} }`)
      );
    });
  });

  describe('options', () => {
    it('N7: converts unmapped media queries and supports to arbitrary variants if enabled', async () => {
      const css =
        '@media (max-width: 767px) { .a { color: red } } @supports not (display: grid) { .a { float: left } }';

      expect(await convert(css)).toBe(
        normalizeCSS(
          '@media (max-width: 767px) { .a { @apply text-[red] } } @supports not (display: grid) { .a { @apply float-left } }'
        )
      );
      expect(await convert(css, { arbitraryVariants: true })).toBe(
        normalizeCSS(
          '.a { @apply [@media_(max-width:_767px)]:text-[red] [@supports_not_(display:_grid)]:float-left; }'
        )
      );
    });

    it('converts single declaration supports to supports-[] variants', async () => {
      expect(
        await convert('@supports (display: grid) { .a { display: grid } }')
      ).toBe(normalizeCSS('.a { @apply supports-[display:grid]:grid; }'));
    });

    it('uses exact values in strict mode', async () => {
      const css = '.a { font-size: 14px; transition: opacity }';

      expect(await convert(css)).toBe(
        normalizeCSS('.a { @apply text-sm transition-opacity }')
      );
      expect(await convert(css, { strict: true })).toBe(
        normalizeCSS(
          '.a { @apply text-[length:14px] transition-opacity duration-[0s] ease-[ease] delay-[0s] }'
        )
      );
    });
  });

  describe('review findings', () => {
    it.each<[string, string, Partial<TailwindConverterConfig>?]>([
      // CSS preceding the rule inside the at-rule would be overridden by hoisted utilities
      [
        '.a { margin: 0 } @media (min-width: 768px) { .b { margin-top: 1px; margin-top: 2px } .a { margin-top: 8px } }',
        '.a { @apply m-0 } @media (min-width: 768px) { .b { margin-top: 1px; margin-top: 2px } .a { @apply mt-2 } }',
      ],
      // Tailwind collapses duplicate declarations regardless of !important
      [
        '.a { padding-top: 4px; padding: 8px 12px !important }',
        '.a { @apply !px-3 !py-2 }',
      ],
      [
        '.a:hover { padding: 8px 12px !important } .a:hover { padding-top: 4px }',
        '.a { @apply hover:!px-3 hover:!py-2 }',
      ],
      // arbitrary properties are emitted after the other utilities with the same variants
      [
        '.a:hover { border-top: 1px dashed } /* not adjacent */ .a:hover { border-top-width: 2px }',
        '.a { @apply hover:[border-top:1px_dashed] } .a { @apply hover:border-t-2 }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      // shorthands reset all their longhands
      [
        '.a { font: 12px serif; font-variant-numeric: tabular-nums }',
        '.a { font: 12px serif; font-variant-numeric: tabular-nums }',
      ],
      [
        '.a { background-position-x: 10px; background-position: center }',
        '.a { background-position-x: 10px; background-position: center }',
      ],
      [
        '.a { border-image: url(x) 30; border: 1px solid red }',
        '.a { border-image: url(x) 30; border: 1px solid red }',
      ],
      // an existing `@apply` may set anything
      [
        '.a { @apply mt-1; margin-top: 8px }',
        '.a { @apply mt-1; margin-top: 8px }',
      ],
      [
        '.a { margin-top: 8px } .b { @apply mt-1 } .a:hover { margin-top: 4px }',
        '.a { @apply mt-2 } .b { @apply mt-1 } .a { @apply hover:mt-1 }',
      ],
      // the more specific utility wins whatever the at-rules are
      [
        '.k { margin: 0 } .k:hover { margin-top: 4px } @media (min-width: 768px) { .k { margin-top: 8px } }',
        '.k { @apply m-0 hover:mt-1 md:mt-2 }',
      ],
      // unknown at-rules may style elements, keyframes don't
      [
        '.a { margin: 0 } @scope (.x) { .a { margin-top: 1px } } .a:hover { margin-top: 8px }',
        '.a { @apply m-0 } @scope (.x) { .a { margin-top: 1px } } .a { @apply hover:mt-2 }',
      ],
      [
        '.a { opacity: 0 } @keyframes f { from { opacity: 1 } } .a:hover { opacity: 1 }',
        '.a { @apply opacity-0 hover:opacity-100 } @keyframes f { from { opacity: 1 } }',
      ],
      // a variant after a single-colon pseudo-element
      [
        '.a:before:hover { margin-top: 4px }',
        '.a:before:hover { @apply mt-1 }',
      ],
      // side effects of utilities
      [
        '.x { border-style: dashed; border-top: 1px solid red }',
        '.x { @apply border-dashed; border-top: 1px solid red }',
      ],
      [
        '.x { border-top: 1px solid; border-bottom: 2px solid }',
        '.x { @apply border-b-2 border-y-current border-t border-solid }',
      ],
      [
        '.x { border-top: 1px solid }',
        '.x { border-top: 1px solid }',
        { strict: true },
      ],
      [
        '.x { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: auto }',
        '.x { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: auto }',
      ],
      [
        '.x { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale }',
        '.x { @apply antialiased }',
        { strict: true },
      ],
      [
        '.x { -webkit-font-smoothing: antialiased }',
        '.x { -webkit-font-smoothing: antialiased }',
        { strict: true },
      ],
      ['.x { word-break: normal }', '.x { @apply break-normal }'],
      [
        '.x { word-break: normal }',
        '.x { word-break: normal }',
        { strict: true },
      ],
      // transform and filter utilities compose with the ones of other rules
      [
        '.x { transform: rotate(45deg); filter: blur(4px) }',
        '.x { transform: rotate(45deg); filter: blur(4px) }',
        { strict: true },
      ],
      [
        '.x { transform: none; filter: none }',
        '.x { @apply transform-none filter-none }',
        { strict: true },
      ],
      // escapes in the base selector
      ['.w-1\\/2:hover { margin-top: 4px }', '.w-1\\/2 { @apply hover:mt-1 }'],
      ['.\\32xl:hover { margin-top: 4px }', '.\\32xl { @apply hover:mt-1 }'],
      // attribute values
      [
        '.a[data-x="a  b"] { margin-top: 4px }',
        '.a { @apply data-[x="a__b"]:mt-1 }',
      ],
      [
        '.a[data-x="-1"] { margin-top: 4px }',
        '.a { @apply data-[x="-1"]:mt-1 }',
      ],
      // `/` and braces can't be used in arbitrary variants
      [
        '.a[data-href="/foo"] { margin-top: 4px }',
        '.a[data-href="/foo"] { @apply mt-1 }',
      ],
      [
        '@supports (aspect-ratio: 1/1) { .a { margin-top: 4px } }',
        '@supports (aspect-ratio: 1/1) { .a { @apply mt-1 } }',
        { arbitraryVariants: true },
      ],
      [
        '@media (min-aspect-ratio: 16/9) { .a { margin-top: 4px } }',
        '@media (min-aspect-ratio: 16/9) { .a { @apply mt-1 } }',
        { arbitraryVariants: true },
      ],
      [
        '@media { .a:hover { color: red } }',
        '@media { .a { @apply hover:text-[red] } }',
        { arbitraryVariants: true },
      ],
      // theme values
      ['.x { text-indent: -1rem }', '.x { @apply -indent-4 }'],
      ['.x { border-color: #e5e7eb }', '.x { @apply border-gray-200 }'],
      ['.x { border-width: 1PX }', '.x { @apply border }'],
      // variables may stand for several values
      ['.x { padding: var(--p) }', '.x { @apply p-[var(--p)] }'],
      ['.x { margin: 1px var(--a) }', '.x { @apply m-[1px_var(--a)] }'],
      ['.x { margin: 1px / 2px }', '.x { margin: 1px / 2px }'],
    ])('converts %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it('keeps empty @layer blocks declaring the order of layers', async () => {
      expect(
        await convert(
          '@layer a {} @layer b { .x {} } @media print { .y {} } .z { color: red }'
        )
      ).toBe(normalizeCSS('@layer a {} @layer b {} .z { @apply text-[red] }'));
    });

    it('does not crash on property names of Object.prototype', async () => {
      expect(
        await convert('.x { constructor: 1; toString: 1; color: constructor }')
      ).toBe(
        normalizeCSS('.x { constructor: 1; toString: 1; color: constructor }')
      );
    });
  });

  describe('GitHub issues', () => {
    it.each<[string, string, string, Partial<TailwindConverterConfig>?]>([
      [
        '#7: does not crash on keyframe selectors',
        '@keyframes test { 50% { opacity: 1 } } .a { color: red }',
        '@keyframes test { 50% { opacity: 1 } } .a { @apply text-[red] }',
      ],
      [
        '#12: uses theme values for variables in spacing shorthands',
        '.a { margin: var(--spacing-a); padding: var(--spacing-b) }',
        '.a { @apply p-spacing-b m-spacinga }',
        {
          tailwindConfig: {
            content: [],
            theme: {
              extend: {
                spacing: {
                  spacinga: 'var(--spacing-a)',
                  'spacing-b': 'var(--spacing-b)',
                },
              },
            },
          },
        },
      ],
      [
        '#12: uses arbitrary values for other variables in spacing shorthands',
        '.a { margin: var(--other) }',
        '.a { @apply m-[var(--other)] }',
      ],
      [
        '#15: keeps !important',
        '.a { border-radius: 4px !important }',
        '.a { @apply !rounded }',
      ],
      [
        '#21: does not apply a utility in the rule of the same class',
        '.text-lg { font-size: 1.125rem; line-height: 1.75rem }',
        '.text-lg { @apply leading-7; font-size: 1.125rem }',
      ],
      [
        '#22: lets a longhand override a shorthand',
        '.a { margin: 1rem; margin-top: 0 }',
        '.a { @apply mt-0 mb-4 mx-4 }',
      ],
      [
        '#22: keeps a side shorthand resetting the side after a border shorthand',
        '.a { border: 2px solid #fff; border-top: 3px }',
        '.a { @apply border-2 border-solid border-white; border-top: 3px }',
      ],
      [
        '#23: keeps a rule with a variant followed by the base rule',
        '.a:first-child { flex: 1 1 0% } .a { font-family: Inter }',
        '.a { @apply first:flex-1 } .a { font-family: Inter }',
      ],
      [
        '#23: merges a rule with a variant into the preceding base rule',
        '.a { font-family: Inter } .a:first-child { flex: 1 1 0% }',
        '.a { @apply first:flex-1; font-family: Inter }',
      ],
    ])('%s', async (_, css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it.each([
      ['.a { border-width: 1px 0 }', '.a { @apply border-x-0 border-y }'],
      [
        '.a { border-width: 1px 2px 3px 4px }',
        '.a { @apply border-l-4 border-r-2 border-b-[3px] border-t }',
      ],
      [
        '.a { border: 1px solid; border-width: 1px 0 }',
        '.a { @apply border-x-0 border-solid border-current border-y }',
      ],
      [
        '.a { border-top-width: 5px; border-width: 1px 0 }',
        '.a { @apply border-x-0 border-y }',
      ],
      [
        '.a { border-width: 1px 0; border-top-width: 5px }',
        '.a { @apply border-t-[5px] border-x-0 border-y }',
      ],
      [
        '.a { border-width: 1px 0 } .a:hover { border-top-width: 3px }',
        '.a { @apply border-x-0 border-y hover:border-t-[3px] }',
      ],
      ['.a { border-width: var(--w) 0 }', '.a { border-width: var(--w) 0 }'],
      [
        '.a { border-width: 1px 2px 3px 4px 5px }',
        '.a { border-width: 1px 2px 3px 4px 5px }',
      ],
    ])(
      '#25: converts border-width with several values: %s',
      async (css, expected) => {
        expect(await convert(css)).toBe(normalizeCSS(expected));
      }
    );
  });

  describe('second review', () => {
    it.each<[string, string, string, Partial<TailwindConverterConfig>?]>([
      [
        'checks classes of the file when a rule with a variant stays in place',
        '.float-left { color: blue } .b::before { float: left }',
        '.float-left { @apply text-[blue] } .b::before { float: left }',
      ],
      [
        'allows classes of the file with variants',
        '.block { color: blue } .b:hover { display: block }',
        '.block { @apply text-[blue] } .b { @apply hover:block }',
      ],
      [
        'does not reset the width of an invisible border',
        '.btn { border: none rgba(0,0,0,0) } .group .btn { border-right: 1px solid rgba(0,0,0,.2) }',
        '.btn { @apply border-none border-[rgba(0,0,0,0)] } .group .btn { @apply border-r-[rgba(0,0,0,0.2)] border-r border-solid }',
      ],
      [
        'keeps an invisible border followed by its width',
        '.a { border: none red; border-width: 2px }',
        '.a { border: none red; border-width: 2px }',
      ],
      [
        'keeps values that are names of Object.prototype properties',
        '.a { flex: constructor; font-weight: __proto__; color: __proto__ }',
        '.a { flex: constructor; font-weight: __proto__; color: __proto__ }',
      ],
      [
        'merges adjacent rules with the same selector, so that side effects are ordered as in one rule',
        '.a { line-height: 2 } .a { font-size: 14px } .b { transition-duration: 1s } .b { transition-property: opacity }',
        '.a { @apply leading-loose text-sm } .b { @apply duration-1000 transition-opacity }',
      ],
      [
        'does not merge adjacent rules setting the same properties',
        '.a { width: 13px !important } .a { width: 4px }',
        '.a { @apply !w-[13px] } .a { @apply w-1 }',
      ],
      [
        'does not merge rules over a rule setting the side effects of their utilities',
        '.a { color: red } .b { font-size: 14px } .a { line-height: 2 }',
        '.a { @apply text-[red] } .b { @apply text-sm } .a { @apply leading-loose }',
      ],
      [
        'uses exact utilities for important declarations',
        '.a { font-size: 14px !important; line-height: 2 }',
        '.a { @apply !text-[length:14px] leading-loose }',
      ],
      [
        'does not merge the same variants in a different order',
        '.a:focus:hover { margin-left: 13px } .a:hover:focus { margin: 19px }',
        '.a { @apply focus:hover:ml-[13px] } .a { @apply hover:focus:m-[19px] }',
      ],
      [
        'keeps the base selector as written',
        '1abc { &:hover { color: blue } color: red }',
        '1abc { @apply hover:text-[blue] } 1abc { @apply text-[red] }',
        { postCSSPlugins: [require('postcss-nested')] },
      ],
      [
        'keeps values with dividers',
        '.a { border-width: 1px, 2px } .b { border: 1px, solid }',
        '.a { border-width: 1px, 2px } .b { border: 1px, solid }',
      ],
      [
        'keeps a border shorthand with a variable that may stand for several parts',
        '.a { border: var(--w) solid } .b { border: 1px var(--rest) } .c { border: 1px solid var(--c) }',
        '.a { border: var(--w) solid } .b { border: 1px var(--rest) } .c { @apply border border-[color:var(--c)] border-solid }',
      ],
      [
        'does not use variants styling descendants',
        'ul::marker { color: red } .a::selection { color: red }',
        'ul::marker { @apply text-[red] } .a::selection { @apply text-[red] }',
      ],
      [
        'does not convert rules in native cascade layers',
        '@layer x { .a { transform: rotate(45deg) } }',
        '@layer x { .a { transform: rotate(45deg) } }',
      ],
      [
        'keeps the text-decoration shorthand with strict',
        '.a:hover { text-decoration: line-through }',
        '.a:hover { text-decoration: line-through }',
        { strict: true },
      ],
    ])('%s', async (_, css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it('converts rules in the layers of Tailwind', async () => {
      const converter = new TailwindConverter({
        tailwindConfig: { content: [] },
      });
      const { convertedRoot } = await converter.convertCSS(
        '@layer components { .a { transform: rotate(45deg) } }'
      );

      expect(normalizeCSS(convertedRoot.toString())).toBe(
        normalizeCSS('@layer components { .a { @apply rotate-45 } }')
      );
    });

    it('checks classes of the file in the 1.x conversion used by subclasses', async () => {
      class CustomConverter extends TailwindConverter {
        protected makeTailwindNode(
          ...args: Parameters<TailwindConverter['makeTailwindNode']>
        ) {
          return super.makeTailwindNode(...args);
        }
      }
      const converter = new CustomConverter({
        tailwindConfig: { content: [] },
      });
      const { convertedRoot } = await converter.convertCSS(
        '.float-left { color: blue } .b { float: left }'
      );

      expect(normalizeCSS(convertedRoot.toString())).toBe(
        normalizeCSS('.float-left { @apply text-[blue] } .b { float: left }')
      );
    });

    it('keeps deeply nested values and handles long whitespace', async () => {
      const deep = 'calc('.repeat(3000) + '1px' + ')'.repeat(3000);
      const spaces = ' '.repeat(100000);
      const converter = new TailwindConverter({
        tailwindConfig: { content: [] },
      });

      await expect(
        converter.convertCSS(
          `.a { margin: ${deep}; border: ${deep}; color: a${spaces}b; padding: var(--a${spaces}) }`
        )
      ).resolves.toBeDefined();
    });
  });
});
