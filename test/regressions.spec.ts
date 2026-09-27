import postcss, { Document } from 'postcss';

import {
  TailwindConverter,
  TailwindConverterConfig,
} from '../src/TailwindConverter';
import { convert, createConverter, normalizeCSS } from './helpers/convert';

type Case = [string, string, Partial<TailwindConverterConfig>?];
type NamedCase = [string, string, string, Partial<TailwindConverterConfig>?];

/**
 * Every conversion result is also compiled by Tailwind to make sure that all classes exist.
 */
describe('regressions', () => {
  describe('rules and at-rules', () => {
    it.each<NamedCase>([
      [
        'keeps a rule with a variant when there is no base rule before it',
        '.foo:hover { color: red }',
        '.foo { @apply hover:text-[red]; }',
      ],
      [
        'keeps variant rules followed by a media query',
        '.a:focus { color: red } @media (min-width: 768px) { .a { display: block } }',
        '.a { @apply focus:text-[red] md:block; }',
      ],
      [
        'keeps variant rules of complex selectors',
        ':is(.a, .b):hover { color: red }',
        ':is(.a, .b) { @apply hover:text-[red]; }',
      ],
      [
        'does not touch rules inside non-style at-rules',
        "@font-face { font-family: 'Foo'; font-weight: 400 } @page :first { margin: 1in }",
        "@font-face { font-family: 'Foo'; font-weight: 400 } @page :first { margin: 1in }",
      ],
      [
        'converts only the own declarations of a rule with nested rules',
        '.a { color: red; .b { display: block } }',
        '.a { @apply text-[red]; .b { @apply block } }',
      ],
      [
        'converts rules with selectors that cannot be parsed in place',
        '.a { color: red } &:hover { color: blue }',
        '.a { @apply text-[red] } &:hover { @apply text-[blue] }',
      ],
      [
        'removes at-rules that became empty',
        '@media (min-width: 768px) { .a { color: red } }',
        '.a { @apply md:text-[red]; }',
      ],
      [
        'keeps empty @layer blocks declaring the order of layers',
        '@layer a {} @layer b { .x {} } @media print { .y {} } .z { color: red }',
        '@layer a {} @layer b {} .z { @apply text-[red] }',
      ],
      [
        'does not convert rules in native cascade layers',
        '@layer x { .a { transform: rotate(45deg) } }',
        '@layer x { .a { transform: rotate(45deg) } }',
      ],
      [
        'does not crash on property names of Object.prototype',
        '.x { constructor: 1; toString: 1; color: constructor }',
        '.x { constructor: 1; toString: 1; color: constructor }',
      ],
      [
        'keeps values that are names of Object.prototype properties',
        '.a { flex: constructor; font-weight: __proto__; color: __proto__ }',
        '.a { flex: constructor; font-weight: __proto__; color: __proto__ }',
      ],
    ])('%s', async (_, css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it('does not touch keyframes', async () => {
      const keyframes =
        '@keyframes spin { 0% { transform: rotate(0deg) } 50% { opacity: .5 } 100% { transform: rotate(360deg) } }' +
        '@keyframes move { from { transform: translateX(0) } to { transform: translateX(10px) } }' +
        '@-webkit-keyframes fade { from { opacity: 0 } }';

      expect(await convert(`${keyframes} .a { display: block }`)).toBe(
        normalizeCSS(`${keyframes} .a { @apply block }`)
      );
    });

    it('converts rules in the layers of Tailwind', async () => {
      // not compiled: Tailwind requires `@tailwind components` for `@layer components`
      const { convertedRoot } = await createConverter().convertCSS(
        '@layer components { .a { transform: rotate(45deg) } }'
      );

      expect(normalizeCSS(convertedRoot.toString())).toBe(
        normalizeCSS('@layer components { .a { @apply rotate-45 } }')
      );
    });

    it('leaves unbalanced values as is', async () => {
      const css = '.a { margin: 1px); color: a]b; content: "a }';
      const { convertedRoot } = await createConverter({
        arbitraryPropertiesIsEnabled: true,
      }).convertCSS(css);

      expect(normalizeCSS(convertedRoot.toString())).toBe(normalizeCSS(css));
    });

    it('keeps deeply nested values and handles long whitespace', async () => {
      // deep enough to overflow the stack of the value parser
      const deep = 'calc('.repeat(100000) + '1px' + ')'.repeat(100000);
      const spaces = ' '.repeat(100000);

      const { convertedRoot } = await createConverter().convertCSS(
        `.a { margin: ${deep}; border: ${deep}; color: a${spaces}b; padding: var(--a${spaces}) }`
      );

      expect(convertedRoot.toString()).toBe(
        `.a {\n @apply text-[a_b] p-[var(--a_)];\n margin: ${deep};\n border: ${deep}\n}`
      );
    });

    it('handles deeply nested at-rules and rules', async () => {
      const depth = 3000;
      const converter = createConverter();
      const nested = (open: string, content: string) =>
        open.repeat(depth) + content + '}'.repeat(depth);

      const media = await converter.convertCSS(
        nested('@media (min-width: 1px) {', '.a:hover { color: red }')
      );
      const rules = await converter.convertCSS(nested('.a {', 'color: red'));

      expect(media.nodes.map(node => node.tailwindClasses)).toEqual([
        ['hover:text-[red]'],
      ]);
      expect(rules.nodes.map(node => node.tailwindClasses)).toEqual([
        ['text-[red]'],
      ]);
    });

    it('removes empty containers in a document', () => {
      const converter = new (class extends TailwindConverter {
        clean(root: Document) {
          this.cleanRaws(root);
        }
      })();
      const document = postcss.document({
        nodes: [postcss.parse('@media print { .a {} }')],
      });

      converter.clean(document);

      expect(document.toString()).toBe('');
    });
  });

  describe('selectors and variants', () => {
    it.each<Case>([
      [
        '.a[aria-disabled="true"] { opacity: 0 } .a[data-state="open"] { display: block } ' +
          '.a[aria-expanded] { color: red } .a[data-foo^="x"] { color: red }',
        '.a { @apply aria-disabled:opacity-0 data-[state=open]:block aria-[expanded]:text-[red]; } ' +
          '.a[data-foo^="x"] { @apply text-[red] }',
      ],
      [
        '.a[data-x="a b_c"] { margin-top: 4px }',
        '.a { @apply data-[x="a_b\\_c"]:mt-1 }',
      ],
      [
        '.a[data-x="a  b"] { margin-top: 4px }',
        '.a[data-x="a  b"] { @apply mt-1 }',
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
      // escapes in the base selector
      ['.w-1\\/2:hover { margin-top: 4px }', '.w-1\\/2 { @apply hover:mt-1 }'],
      ['.\\32xl:hover { margin-top: 4px }', '.\\32xl { @apply hover:mt-1 }'],
      [
        '.a:nth-child(odd) { color: red } .b:nth-child(2n) { color: blue }',
        '.a { @apply odd:text-[red]; } .b { @apply even:text-[blue]; }',
      ],
      [
        '.a::placeholder { color: red } .b:placeholder-shown { color: blue }',
        '.a { @apply placeholder:text-[red]; } .b { @apply placeholder-shown:text-[blue]; }',
      ],
      // Tailwind's `marker:` and `selection:` also style the descendants
      [
        'ul::marker { color: red } .a::selection { color: red }',
        'ul::marker { @apply text-[red] } .a::selection { @apply text-[red] }',
      ],
      // Tailwind puts pseudo-elements last
      [
        '.a:before:hover { margin-top: 4px }',
        '.a:before:hover { @apply mt-1 }',
      ],
      // `before:` utilities set `content: var(--tw-content)`
      [
        '.a::before { color: red } .b::before { content: "x"; content: attr(title) } .b:hover::before { color: blue }',
        '.a::before { @apply text-[red] } .b::before { content: "x"; content: attr(title) } .b:hover::before { @apply text-[blue] }',
      ],
      [
        '.a::before { content: ""; color: red } .a:hover::before { color: blue }',
        '.a { @apply before:content-[""] before:text-[red] hover:before:text-[blue] }',
      ],
      [
        '1abc { &:hover { color: blue } color: red }',
        '1abc { @apply hover:text-[blue] } 1abc { @apply text-[red] }',
        { postCSSPlugins: [require('postcss-nested')] },
      ],
      // variants of rules in at-rules that can't be converted stay inside them
      [
        '@media (min-width: 769px) { .foo::before { content: ""; display: block } }',
        '@media (min-width: 769px) { .foo { @apply before:content-[""] before:block; } }',
      ],
      [
        '@supports (display: grid) { .a { display: grid } }',
        '.a { @apply supports-[display:grid]:grid; }',
      ],
    ])('converts %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it('converts prefers-color-scheme only when darkMode is "media"', async () => {
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
  });

  describe('placement and cascade', () => {
    it.each<Case>([
      [
        '.a:hover { color: red } .a { display: block }',
        '.a { @apply hover:text-[red]; } .a { @apply block }',
      ],
      [
        '.a:hover { color: red } .b { color: green } .a { color: blue }',
        '.a { @apply hover:text-[red]; } .b { @apply text-[green] } .a { @apply text-[blue] }',
      ],
      // merging into a distant rule would let `m-2` override `mt-4` on md
      [
        '@media (min-width: 768px) { .a { margin: 8px } } .a { margin-top: 16px }',
        '.a { @apply md:m-2; } .a { @apply mt-4 }',
      ],
      [
        '.a { color: red } .b { color: blue } .a:hover { color: green }',
        '.a { @apply text-[red] } .b { @apply text-[blue] } .a { @apply hover:text-[green]; }',
      ],
      [
        '.a { color: red } .b { margin: 0 } .a:hover { color: green }',
        '.a { @apply text-[red] hover:text-[green] } .b { @apply m-0 }',
      ],
      // a utility with a selector variant overrides the base utility it's merged with
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
      [
        '.a:focus:hover { margin-left: 13px } .a:hover:focus { margin: 19px }',
        '.a { @apply focus:hover:ml-[13px] } .a { @apply hover:focus:m-[19px] }',
      ],
      // there is no base selector to move the variant to
      [':hover { color: red }', ':hover { @apply text-[red] }'],
      // CSS preceding the rule inside the at-rule would be overridden by hoisted utilities
      [
        '.a { margin: 0 } @media (min-width: 768px) { .b { margin-top: 1px; margin-top: 2px } .a { margin-top: 8px } }',
        '.a { @apply m-0 } @media (min-width: 768px) { .b { margin-top: 1px; margin-top: 2px } .a { @apply mt-2 } }',
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
      // an existing `@apply` may set anything
      [
        '.a { @apply mt-1; margin-top: 8px }',
        '.a { @apply mt-1; margin-top: 8px }',
      ],
      [
        '.a { margin-top: 8px } .b { @apply mt-1 } .a:hover { margin-top: 4px }',
        '.a { @apply mt-2 } .b { @apply mt-1 } .a { @apply hover:mt-1 }',
      ],
      // adjacent rules with the same selector are merged, so that side effects are ordered as in one rule
      [
        '.a { line-height: 2 } .a { font-size: 14px } .b { transition-duration: 1s } .b { transition-property: opacity }',
        '.a { @apply leading-loose text-sm } .b { @apply duration-1000 transition-opacity }',
      ],
      [
        '.a { width: 13px !important } .a { width: 4px }',
        '.a { @apply !w-[13px] } .a { @apply w-1 }',
      ],
      [
        '.a { color: red } .b { font-size: 14px } .a { line-height: 2 }',
        '.a { @apply text-[red] } .b { @apply text-sm } .a { @apply leading-loose }',
      ],
    ])('places the utilities of %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it.each<Case>([
      // fallbacks for older browsers
      [
        '.a { display: -webkit-box; display: flex } .b { height: 100vh; height: 100dvh }',
        '.a { display: -webkit-box; display: flex } .b { height: 100vh; height: 100dvh }',
      ],
      // utilities overridden by later declarations are dropped
      ['.a { margin-top: 16px; margin: 8px }', '.a { @apply m-2 }'],
      [
        '.a { border-top: 1px solid red; border-color: blue }',
        '.a { @apply border-t border-solid border-[blue] }',
      ],
      [
        '.a { text-decoration: line-through; text-decoration-line: underline }',
        '.a { @apply underline }',
      ],
      // `@apply` is inserted before the unconverted declarations
      [
        '.a { flex-flow: column; flex-wrap: wrap-reverse; display: block }',
        '.a { @apply block; flex-flow: column; flex-wrap: wrap-reverse }',
      ],
      // arbitrary properties are emitted after all utilities
      [
        '.a { grid-template-areas: "a b"; grid-template: none }',
        '.a { @apply [grid-template-areas:"a_b"]; grid-template: none }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      [
        '.a:hover { border-top: 1px dashed } /* not adjacent */ .a:hover { border-top-width: 2px }',
        '.a { @apply hover:[border-top:1px_dashed] } .a { @apply hover:border-t-2 }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      [
        '.a { margin-inline-start: 4px; margin: 8px }',
        '.a { @apply [margin-inline-start:4px]; margin: 8px }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      // `margin-inline-start` is `margin-right` with `direction: rtl`
      [
        '.a { margin-left: 8px; margin-inline-start: 4px }',
        '.a { @apply [margin-inline-start:4px] ml-2 }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      [
        '.a { margin-left: 8px; margin-inline: 4px }',
        '.a { @apply [margin-inline:4px] ml-2 }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      // `margin-inline-start` is `margin-top` with `writing-mode: vertical-lr`
      [
        '.a { margin-inline-start: 4px; margin-top: 8px }',
        '.a { margin-inline-start: 4px; margin-top: 8px }',
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
        '.x { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: auto }',
        '.x { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: auto }',
      ],
    ])('keeps the cascade of %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it('moves utilities over a limited number of rules', async () => {
      const converter = createConverter();
      const convertWithRulesBetween = async (count: number) => {
        const between = Array.from(
          { length: count },
          (_, index) => `.b${index} { top: 0 }`
        ).join(' ');
        const { nodes } = await converter.convertCSS(
          `.a { color: red } ${between} .a:hover { color: blue }`
        );

        return nodes
          .filter(node => node.rule.selector === '.a')
          .map(node => node.tailwindClasses);
      };

      expect(await convertWithRulesBetween(10)).toEqual([
        ['text-[red]', 'hover:text-[blue]'],
      ]);
      expect(await convertWithRulesBetween(1000)).toEqual([
        ['text-[red]'],
        ['hover:text-[blue]'],
      ]);
    });
  });

  describe('@apply conflicts', () => {
    it.each<NamedCase>([
      [
        'does not apply a class in a rule with the same class',
        '.float-left { float: left } .m-2 { margin: 8px }',
        '.float-left { float: left } .m-2 { @apply mt-2 mr-2 mb-2 ml-2 }',
      ],
      [
        // `@apply m-2` would also copy `.foo .m-2` to `.foo .a`
        'does not apply classes used by other rules of the file',
        '.foo .m-2 { color: red } .foo .float-left { color: blue } .a { margin: 8px; float: left }',
        '.foo .m-2 { @apply text-[red] } .foo .float-left { @apply text-[blue] } .a { @apply mt-2 mr-2 mb-2 ml-2; float: left }',
      ],
      [
        'checks classes with variants',
        '.a:hover { margin: 8px } .foo .hover\\:m-2 { color: red }',
        '.a { @apply hover:mt-2 hover:mr-2 hover:mb-2 hover:ml-2 } .foo .hover\\:m-2 { @apply text-[red] }',
      ],
      [
        'checks important classes',
        '.\\!float-left { color: red } .a { float: left !important } ' +
          '.hover\\:\\!float-left { color: red } .b:hover { float: left !important }',
        '.\\!float-left { @apply text-[red] } .a { float: left !important } ' +
          '.hover\\:\\!float-left { @apply text-[red] } .b:hover { float: left !important }',
      ],
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
    ])('%s', async (_, css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it('checks classes of the file in the placement of 1.0 used by subclasses', async () => {
      class CustomConverter extends TailwindConverter {
        protected makeTailwindNode(
          ...args: Parameters<TailwindConverter['makeTailwindNode']>
        ) {
          return super.makeTailwindNode(...args);
        }
      }
      const { convertedRoot } = await new CustomConverter({
        tailwindConfig: { content: [] },
      }).convertCSS('.float-left { color: blue } .b { float: left }');

      expect(normalizeCSS(convertedRoot.toString())).toBe(
        normalizeCSS('.float-left { @apply text-[blue] } .b { float: left }')
      );
    });
  });

  describe('borders', () => {
    it.each<Case>([
      ['.a { border: none }', '.a { @apply border-none }'],
      [
        '.a { border: solid 1px }',
        '.a { @apply border border-solid border-current }',
      ],
      [
        '.a { border: 1px solid red }',
        '.a { @apply border border-solid border-[red] }',
      ],
      // the omitted parts of the shorthand are reset to their initial values
      [
        '.a { border: solid red }',
        '.a { @apply border-[medium] border-solid border-[red] }',
      ],
      [
        '.a { border: 2px dotted }',
        '.a { @apply border-2 border-dotted border-current }',
      ],
      // without a style the border isn't displayed,
      // the width and the color are kept for a style set by other rules
      [
        '.a { border: 1px red }',
        '.a { @apply border border-none border-[red] }',
      ],
      ['.a { border: 1px }', '.a { @apply border border-none border-current }'],
      ['.a { border: 0 }', '.a { @apply border-0 }'],
      ['.a { border-right: none }', '.a { @apply border-r-0 }'],
      [
        '.a { border-top: 1px solid }',
        '.a { @apply border-t-current border-t border-solid }',
      ],
      [
        '.btn { border: none rgba(0,0,0,0) } .group .btn { border-right: 1px solid rgba(0,0,0,.2) }',
        '.btn { @apply border-none border-[rgba(0,0,0,0)] } .group .btn { @apply border-r-[rgba(0,0,0,0.2)] border-r border-solid }',
      ],
      [
        '.a { border: none } .b { border-top: none }',
        '.a { @apply border-[medium] border-none border-current } .b { border-top: none }',
        { strict: true },
      ],
      ['.x { border-color: #e5e7eb }', '.x { @apply border-gray-200 }'],
      ['.x { border-width: 1PX }', '.x { @apply border }'],
      [
        '.a { border: var(--w) solid } .b { border: 1px var(--rest) } .c { border: 1px solid var(--c) }',
        '.a { border: var(--w) solid } .b { border: 1px var(--rest) } .c { @apply border border-[color:var(--c)] border-solid }',
      ],
      [
        '.a { border-spacing: 2px 4px }',
        '.a { @apply border-spacing-x-0.5 border-spacing-y-1 }',
      ],
      [
        '.a { border-spacing: var(--a) 2px }',
        '.a { @apply border-spacing-x-[var(--a)] border-spacing-y-0.5 }',
      ],
    ])('converts %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });

    it.each<[string, Partial<TailwindConverterConfig>?]>([
      // `border-r-0` doesn't reset the style, the later width would make the border visible
      ['.a { border-right: none; border-right-width: 8px }'],
      // `border-none` doesn't reset the width and the color
      ['.a { border: none; border-style: solid }'],
      ['.a { border: none red; border-width: 2px }'],
      // Tailwind has no per-side border styles
      ['.a { border-bottom: 1px dashed red }'],
      ['.a { border-top: 1px solid }', { strict: true }],
      // Tailwind has no `ridge` style, `wavy` is invalid
      ['.a { border: 1px ridge } .b { border: 1px wavy red }'],
      ['.a { border: var(--border) }'],
      ['.a { border: inherit }'],
      ['.a { border-top: 1px solid var(--a, red) var(--b) }'],
      [
        '.a { border: 10% } .b { border: -4px } .c { border: 1 } .d { border: "a b" } .e { border: 1px url(a.png) }',
      ],
      ['.a { border-width: 1px, 2px } .b { border: 1px, solid }'],
      // `border-spacing-[var(--a)]` would repeat the value for both axes
      ['.a { border-spacing: var(--a) }'],
    ])('leaves %s as is', async (css, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(css));
    });
  });

  describe('transforms, filters and transitions', () => {
    it.each<Case>([
      // Tailwind applies the transform functions in a fixed order
      [
        '.a { transform: rotate(45deg) translateX(10px) } .b { transform: translateX(10px) rotate(45deg) }',
        '.a { transform: rotate(45deg) translateX(10px) } .b { @apply translate-x-2.5 rotate-45 }',
      ],
      [
        '.a { filter: blur(4px) blur(8px) } .b { transform: skew(10deg, 20deg) } .c { transform: skew(10deg) }',
        '.a { filter: blur(4px) blur(8px) } .b { transform: skew(10deg, 20deg) } .c { @apply skew-x-[10deg] }',
      ],
      [
        '.a { transform: translateX(calc(100% - 10px)) } .b { filter: blur(calc(1px + 2px)) }',
        '.a { @apply translate-x-[calc(100%_-_10px)] } .b { @apply blur-[calc(1px_+_2px)] }',
      ],
      ['.a { filter: opacity(0.5) }', '.a { filter: opacity(0.5) }'],
      ['.a { transform: none }', '.a { @apply transform-none }'],
      // function names are case-insensitive
      [
        '.a { transform: translatez(0) } .b { transform: TRANSLATE3D(0, 0, 0) }',
        '.a { @apply transform-gpu } .b { @apply transform-gpu }',
      ],
      // theme drop shadows with several layers
      [
        '.a { filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.1)) drop-shadow(0 1px 1px rgb(0 0 0 / 0.06)) }',
        '.a { @apply drop-shadow }',
      ],
      [
        '.a { filter: blur(4px) drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06)) }',
        '.a { @apply blur-sm drop-shadow-md }',
      ],
      // other layers can't be written as one arbitrary value
      [
        '.a { filter: drop-shadow(0 1px 1px red) drop-shadow(0 2px 2px blue) }',
        '.a { filter: drop-shadow(0 1px 1px red) drop-shadow(0 2px 2px blue) }',
      ],
      // Tailwind applies one duration and timing function to all transitioned properties
      [
        '.a { transition: opacity 0.3s ease, transform 0.3s ease } .b { transition: opacity 0.3s ease-in-out }',
        '.a { transition: opacity 0.3s ease, transform 0.3s ease } .b { @apply transition-opacity duration-300 ease-[ease-in-out] }',
      ],
      [
        '.a { transition-duration: 0.3s; transition-delay: .15s }',
        '.a { @apply duration-300 delay-150 }',
      ],
      // Tailwind generates no utilities for the DEFAULT values of these keys
      [
        '.a { transition-duration: 150ms; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1) }',
        '.a { @apply duration-150 ease-in-out }',
      ],
      ['.a { transition: inherit }', '.a { transition: inherit }'],
      // the utilities compose with the ones set by other rules
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
      [
        '.x { touch-action: pan-x; font-variant-numeric: tabular-nums; scroll-snap-type: x }',
        '.x { @apply touch-pan-x tabular-nums snap-x }',
      ],
      [
        '.x { touch-action: pan-x; font-variant-numeric: tabular-nums; scroll-snap-type: x }',
        '.x { touch-action: pan-x; font-variant-numeric: tabular-nums; scroll-snap-type: x }',
        { strict: true },
      ],
      [
        '.x { touch-action: none; font-variant-numeric: normal; scroll-snap-type: none }',
        '.x { @apply touch-none normal-nums snap-none }',
        { strict: true },
      ],
      [
        '.x { touch-action: pan-y !important; scroll-snap-type: none !important }',
        '.x { @apply !snap-none; touch-action: pan-y !important }',
      ],
    ])('converts %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });
  });

  describe('values', () => {
    it.each<Case>([
      // ambiguous arbitrary values get a type hint
      [
        '.a { background-size: 10px; background-position: 10px 20px }',
        '.a { @apply bg-[length:10px] bg-[position:10px_20px] }',
      ],
      [
        '.a { font-weight: bold } .b { font-weight: normal } .c { font-weight: var(--w) }',
        '.a { @apply font-bold } .b { @apply font-normal } .c { @apply font-[number:var(--w)] }',
      ],
      ['.a { font-size: inherit }', '.a { @apply text-[length:inherit] }'],
      [
        '.a { box-shadow: var(--shadow) }',
        '.a { @apply shadow-[shadow:var(--shadow)] }',
      ],
      ['.a { border-width: inherit }', '.a { @apply border-[length:inherit] }'],
      // negative values
      [
        '.a { padding-top: -4px } .b { margin: -4px }',
        '.a { @apply pt-[-4px] } .b { @apply -m-1 }',
      ],
      ['.a { margin-top: -1rem }', '.a { @apply -mt-4 }'],
      ['.x { text-indent: -1rem }', '.x { @apply -indent-4 }'],
      // variables may stand for several values
      ['.x { padding: var(--p) }', '.x { @apply p-[var(--p)] }'],
      ['.x { margin: 1px var(--a) }', '.x { @apply m-[1px_var(--a)] }'],
      ['.x { inset: var(--a) }', '.x { inset: var(--a) }'],
      // a top-level `/` can't be split into sides
      ['.x { margin: 1px / 2px }', '.x { margin: 1px / 2px }'],
      [
        '.a { inset: 4px } .b { inset: -4px }',
        '.a { @apply inset-1 } .b { @apply -inset-1 }',
      ],
      ['.a { inset: 1px 2px }', '.a { @apply inset-x-0.5 inset-y-px }'],
      ['.a { font-size: 4Q }', '.a { @apply text-[4Q] }'],
      // whitespace between the parts of keyword values
      [
        '.a { outline: 2px  solid transparent } .b { grid-auto-flow: row\n  dense }',
        '.a { @apply outline-none } .b { @apply grid-flow-row-dense }',
      ],
      // a no-break space isn't whitespace in CSS
      [
        '.a { grid-auto-flow: row\u00a0dense }',
        '.a { grid-auto-flow: row\u00a0dense }',
      ],
      ['.a { opacity: 50% }', '.a { @apply opacity-50 }'],
      [
        '.a { flex: auto } .b { flex: none } .c { flex: initial } .d { flex: 1 } .e { flex: 0 0 auto }',
        '.a { @apply flex-auto } .b { @apply flex-none } .c { @apply flex-initial } .d { @apply flex-1 } .e { @apply flex-none }',
      ],
      [
        '.a { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale }',
        '.a { @apply antialiased }',
      ],
      [
        '.a { -webkit-font-smoothing: grayscale } .b { -moz-osx-font-smoothing: antialiased } ' +
          '.c { -webkit-font-smoothing: antialiased } .d { -moz-osx-font-smoothing: grayscale }',
        '.a { -webkit-font-smoothing: grayscale } .b { -moz-osx-font-smoothing: antialiased } ' +
          '.c { @apply antialiased } .d { @apply antialiased }',
      ],
      [
        '.a { page-break-after: always; page-break-inside: avoid } .b { page-break-before: avoid-page }',
        '.a { @apply break-after-page break-inside-avoid } .b { page-break-before: avoid-page }',
      ],
      [
        '.a { color: #123456 }',
        '.a { @apply text-primary }',
        {
          tailwindConfig: {
            content: [],
            theme: { extend: { colors: { primary: { DEFAULT: '#123456' } } } },
          },
        },
      ],
      // strings and urls
      [
        '.a::before { content: ", " } .b { background-image: url(img/.5x.png) }',
        '.a { @apply before:content-[",_"] } .b { @apply bg-[url(img/.5x.png)] }',
      ],
      // whitespace that isn't whitespace in CSS would split the class
      [
        '.a::before { content: "\u2014\u00a0" }',
        '.a { @apply before:content-["\u2014\\a0_"] }',
      ],
      // Tailwind keeps urls verbatim, so spaces are percent-encoded
      [
        '.a { background-image: url("data:image/svg+xml,<svg viewBox=\'0 0 8 8\'/>") }',
        '.a { @apply bg-[url("data:image/svg+xml,<svg%20viewBox=\'0%200%208%208\'/>")] }',
      ],
      // arbitrary properties
      [
        '.a { color: ; }',
        '.a { color: ; }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      [
        '.a { COLOR: red; --Custom: 1 }',
        '.a { @apply [color:red] [--Custom:1] }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      [
        '.a { *display: inline; _height: 1px; zoom: 1 }',
        '.a { @apply [zoom:1]; *display: inline; _height: 1px }',
        { arbitraryPropertiesIsEnabled: true },
      ],
      // CSS-wide keywords would apply to the variables the utilities set
      [
        '.a { box-shadow: revert-layer; border-spacing: inherit; content: unset }',
        '.a { box-shadow: revert-layer; border-spacing: inherit; content: unset }',
      ],
    ])('converts %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });
  });

  describe('important declarations', () => {
    it.each<Case>([
      [
        '.a { color: red !important; margin: 8px }',
        '.a { @apply !text-[red] m-2 }',
      ],
      // the important modifier goes before the prefix
      [
        '.a:hover { margin-top: -16px !important }',
        '.a { @apply hover:!tw--mt-4; }',
        { tailwindConfig: { content: [], prefix: 'tw-' } },
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
      // exact utilities: `!text-sm` would override `line-height`
      [
        '.a { font-size: 14px !important; line-height: 2 }',
        '.a { @apply !text-[length:14px] leading-loose }',
      ],
    ])('converts %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });
  });

  describe('options', () => {
    it('converts unmapped media queries and supports to arbitrary variants if enabled', async () => {
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

    it.each<Case>([
      // `/` and braces can't be used in arbitrary variants
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
      ['.x { word-break: normal }', '.x { @apply break-normal }'],
      // `break-normal` also resets `overflow-wrap`
      [
        '.x { word-break: normal }',
        '.x { word-break: normal }',
        { strict: true },
      ],
      [
        '.x { -webkit-font-smoothing: antialiased }',
        '.x { -webkit-font-smoothing: antialiased }',
        { strict: true },
      ],
      [
        '.x { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale }',
        '.x { @apply antialiased }',
        { strict: true },
      ],
      [
        '.a:hover { text-decoration: line-through }',
        '.a:hover { text-decoration: line-through }',
        { strict: true },
      ],
      [
        '.a { top: 0; left: 0 }',
        '.a { top: 0; left: 0 }',
        { tailwindConfig: { content: [], corePlugins: { inset: false } } },
      ],
      [
        '.a { box-decoration-break: clone }',
        '.a { box-decoration-break: clone }',
        {
          tailwindConfig: {
            content: [],
            corePlugins: { boxDecorationBreak: false },
          },
        },
      ],
    ])('converts %s', async (css, expected, config = {}) => {
      expect(await convert(css, config)).toBe(normalizeCSS(expected));
    });
  });

  describe('GitHub issues', () => {
    it.each<NamedCase>([
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
});
