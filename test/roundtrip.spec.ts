import type { AtRule, Rule } from 'postcss';

import { TailwindConverter } from '../src/TailwindConverter';
import { isPropertySubset, longhandsOf } from '../src/core/longhands';
import { SELECTOR_VARIANTS_ORDER } from '../src/mappings/pseudos-mapping';
import {
  classDeclarations,
  collectClasses,
  compileOutput,
} from './helpers/tailwind';

const converter = new TailwindConverter({ remInPx: 16 });

async function convertDeclaration(property: string, value: string) {
  const result = await converter.convertCSS(`.x { ${property}: ${value} }`);

  return collectClasses(result);
}

/**
 * [property, value, properties the utilities may set in addition to the property and its longhands]
 */
const DECLARATIONS: Array<[string, string, string[]?]> = [
  ['background-size', '10px'],
  ['background-size', 'cover'],
  ['background-size', 'var(--size)'],
  ['background-position', '10px 20px'],
  ['background-position', 'center'],
  ['background-color', 'red'],
  ['background-color', 'var(--color)'],
  ['background-image', 'url(/image.png)'],
  ['font-weight', 'bold'],
  ['font-weight', '600'],
  ['font-weight', 'var(--weight)'],
  ['font-size', '14px', ['line-height']],
  ['font-size', 'var(--size)'],
  ['color', '#fff'],
  ['color', 'var(--color)'],
  ['border', 'none'],
  ['border', '1px solid red'],
  ['border', 'solid 2px'],
  // Tailwind has no per-side border styles, the style is applied to all sides
  ['border-top', '2px solid', ['border-style']],
  ['border-bottom', 'none'],
  ['border-width', '2px'],
  ['border-width', 'var(--width)'],
  ['border-color', 'red'],
  ['border-color', 'var(--color)'],
  ['border-radius', '4px'],
  ['outline-width', '2px'],
  ['outline-color', 'red'],
  ['stroke', 'var(--color)'],
  ['filter', 'blur(4px) grayscale(1)'],
  ['filter', 'drop-shadow(0 0 2px red)'],
  ['filter', 'none'],
  ['backdrop-filter', 'blur(4px) opacity(0.5)'],
  ['opacity', '50%'],
  ['opacity', '0.25'],
  ['transform', 'translateX(10px) rotate(45deg)'],
  ['transform', 'translate(10px, 20px) scale(1.5)'],
  ['transform', 'none'],
  ['transition', 'opacity 0.3s ease-in'],
  ['transition', 'none'],
  ['transition-duration', '0.3s'],
  ['transition-delay', '150ms'],
  ['flex', 'none'],
  ['flex', 'auto'],
  ['flex', '1'],
  ['flex', '2 1 30%'],
  ['margin', '-4px 8px'],
  ['margin-top', '-1rem'],
  ['padding', '1rem 2rem 3rem'],
  ['padding', '10px'],
  ['scroll-margin', '8px'],
  ['scroll-padding', '1rem 2rem'],
  ['top', '-10px'],
  ['left', '50%'],
  ['width', '50%'],
  ['height', '100vh'],
  ['letter-spacing', '-0.025em'],
  ['line-height', '1.5'],
  ['z-index', '10'],
  ['display', 'flex'],
  ['gap', '8px'],
  ['grid-gap', '8px'],
  ['grid-template-columns', 'repeat(2, minmax(0, 1fr))'],
  ['overflow-wrap', 'break-word'],
  ['page-break-after', 'avoid'],
  ['-webkit-font-smoothing', 'antialiased', ['-moz-osx-font-smoothing']],
  ['box-decoration-break', 'clone', ['-webkit-box-decoration-break']],
];

/** Properties that are reported under another name by Tailwind. */
const PROPERTY_ALIASES: Record<string, string[]> = {
  'grid-gap': ['gap'],
  'page-break-after': ['break-after'],
};

describe('round trip', () => {
  it.each(DECLARATIONS)(
    '%s: %s is converted to utilities setting the same properties',
    async (property, value, extraProperties = []) => {
      const classes = await convertDeclaration(property, value);

      expect(classes.length).toBeGreaterThan(0);

      const allowed = new Set([
        property,
        ...(PROPERTY_ALIASES[property] || []),
      ]);
      [property, ...extraProperties].forEach(p =>
        longhandsOf(p).forEach(longhand => allowed.add(longhand))
      );
      const generated = Object.keys(await classDeclarations(classes));

      expect(generated.length).toBeGreaterThan(0);
      // Tailwind may set a shorthand of allowed longhands, e.g. `border-width` for `border`
      expect(
        generated.filter(p => !isPropertySubset(longhandsOf(p), allowed))
      ).toEqual([]);
    }
  );

  it.each([
    ['background-size', '10px', { 'background-size': '10px' }],
    [
      'background-position',
      '10px 20px',
      { 'background-position': '10px 20px' },
    ],
    ['font-weight', 'bold', { 'font-weight': '700' }],
    ['opacity', '50%', { opacity: '0.5' }],
    ['margin-top', '-1rem', { 'margin-top': '-1rem' }],
    ['transition-duration', '0.3s', { 'transition-duration': '300ms' }],
    ['font-size', 'inherit', { 'font-size': 'inherit' }],
    ['border-width', 'inherit', { 'border-width': 'inherit' }],
    [
      'box-shadow',
      'var(--shadow)',
      {
        'box-shadow':
          'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      },
    ],
    ['flex', 'none', { flex: 'none' }],
    ['flex', '2 1 30%', { flex: '2 1 30%' }],
    ['letter-spacing', '-0.025em', { 'letter-spacing': '-0.025em' }],
    [
      'margin',
      '-4px 8px',
      {
        'margin-top': '-0.25rem',
        'margin-bottom': '-0.25rem',
        'margin-left': '0.5rem',
        'margin-right': '0.5rem',
      },
    ],
    [
      'padding',
      '1rem 2rem 3rem',
      {
        'padding-top': '1rem',
        'padding-left': '2rem',
        'padding-right': '2rem',
        'padding-bottom': '3rem',
      },
    ],
    [
      'border',
      'solid red',
      {
        'border-width': 'medium',
        'border-style': 'solid',
        'border-color': 'rgb(255 0 0 / var(--tw-border-opacity))',
      },
    ],
    ['border-right', 'none', { 'border-right-width': '0px' }],
    [
      'border',
      '1px solid red',
      {
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgb(255 0 0 / var(--tw-border-opacity))',
      },
    ],
  ])('%s: %s keeps the value', async (property, value, expected) => {
    const classes = await convertDeclaration(property, value);

    expect(await classDeclarations(classes)).toEqual(expected);
  });
});

/**
 * Returns the value of the property set last for `.x` by the classes.
 */
async function winningValue(classes: string[], property: string) {
  const root = await compileOutput(`.x { @apply ${classes.join(' ')}; }`);
  let value: string | undefined;

  root.walkDecls(property, declaration => {
    value = declaration.value;
  });

  return value;
}

describe('Tailwind invariants the converter relies on', () => {
  // A shorthand utility may be followed by a longhand one in the same `@apply`:
  // Tailwind must always put the longhand utility after the shorthand one.
  it.each([
    ['m-2', 'mt-4', 'margin-top', '1rem'],
    ['m-2', 'mx-4', 'margin-left', '1rem'],
    ['mx-2', 'ml-4', 'margin-left', '1rem'],
    ['p-2', 'pl-4', 'padding-left', '1rem'],
    ['px-2', 'pl-4', 'padding-left', '1rem'],
    ['scroll-m-2', 'scroll-mt-4', 'scroll-margin-top', '1rem'],
    ['scroll-p-2', 'scroll-pt-4', 'scroll-padding-top', '1rem'],
    ['inset-0', 'top-4', 'top', '1rem'],
    ['inset-x-0', 'left-4', 'left', '1rem'],
    ['border', 'border-t-4', 'border-top-width', '4px'],
    ['border-x', 'border-l-4', 'border-left-width', '4px'],
    ['border-[#fff]', 'border-t-[var(--c)]', 'border-top-color', 'var(--c)'],
    ['rounded', 'rounded-tl-lg', 'border-top-left-radius', '0.5rem'],
    ['rounded-t', 'rounded-tl-lg', 'border-top-left-radius', '0.5rem'],
    ['gap-2', 'gap-x-4', 'column-gap', '1rem'],
    ['overflow-hidden', 'overflow-x-auto', 'overflow-x', 'auto'],
    [
      'overscroll-contain',
      'overscroll-x-auto',
      'overscroll-behavior-x',
      'auto',
    ],
    ['transition', 'duration-300', 'transition-duration', '300ms'],
    [
      'transition',
      'ease-in',
      'transition-timing-function',
      'cubic-bezier(0.4, 0, 1, 1)',
    ],
    ['flex-1', 'grow-0', 'flex-grow', '0'],
    ['flex-1', 'basis-4', 'flex-basis', '1rem'],
    ['text-sm', 'leading-10', 'line-height', '2.5rem'],
  ])(
    '%s is overridden by %s',
    async (shorthand, longhand, property, expected) => {
      expect(await winningValue([longhand, shorthand], property)).toBe(
        expected
      );
    }
  );

  it('emits selector variants in the order the converter expects', async () => {
    const variants = SELECTOR_VARIANTS_ORDER.map(variant =>
      variant === 'aria'
        ? 'aria-[x]'
        : variant === 'data'
        ? 'data-[x]'
        : variant
    );
    const classes = variants.map(
      (variant, index) => `${variant}:z-[${index + 1}]`
    );
    const root = await compileOutput(
      `.x { @apply ${[...classes].reverse().join(' ')}; }`
    );
    const order: number[] = [];

    root.walkDecls('z-index', declaration => {
      order.push(Number(declaration.value));
    });

    expect(order).toEqual(variants.map((_, index) => index + 1));
  });

  it('compiles the whole converted output to the source declarations', async () => {
    const result = await converter.convertCSS(
      '.a { margin: 4px; color: red } .a:hover { color: blue } @media (min-width: 768px) { .a { margin: 8px } }'
    );
    const compiled = await compileOutput(result.convertedRoot.toString());
    const declarations: string[] = [];

    compiled.walkDecls(declaration => {
      const parent = declaration.parent as Rule;
      const atRule =
        parent.parent?.type === 'atrule'
          ? `@${(parent.parent as AtRule).params} `
          : '';

      declarations.push(
        `${atRule}${parent.selector} { ${declaration.prop}: ${declaration.value} }`
      );
    });

    expect(declarations.filter(d => !d.includes('{ --tw-'))).toEqual([
      '.a { margin: 0.25rem }',
      '.a { color: rgb(255 0 0 / var(--tw-text-opacity)) }',
      '.a:hover { color: rgb(0 0 255 / var(--tw-text-opacity)) }',
      '@(min-width: 768px) .a { margin: 0.5rem }',
    ]);
  });
});
