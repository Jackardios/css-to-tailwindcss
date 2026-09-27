import {
  TailwindConverter,
  TailwindConverterConfig,
} from '../src/TailwindConverter';
import fs from 'fs';
import type { Rule } from 'postcss';
import type { Config } from 'tailwindcss';
import path from 'path';

import { expectValidConversion } from './helpers/tailwind';

const complexCSS: string = fs
  .readFileSync(path.resolve(__dirname, './fixtures/input.css'))
  .toString();

const simpleCSS = `
.foo {
  padding-top: 12px;
  padding-bottom: 12px;
  font-size: 12px;
  animation-delay: 200ms;
  border-right: 2px dashed;
  border: 4px solid transparent;

  &:hover {
    filter: blur(4px) brightness(0.5) sepia(100%) contrast(1) hue-rotate(30deg)
      invert(0) opacity(0.05) saturate(1.5);
    transform: translateX(12px) translateY(0.5em) translateZ(0.5rem)
      scaleY(0.725) rotate(124deg);
    font-size: 16px;
  }

  @media screen and (min-width: 768px) {
    font-weight: 600;
  }
}
`;

const tailwindConfig: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        'custom-color': {
          100: '#123456',
          200: 'hsla(210, 100%, 51.0%, 0.016)',
          300: '#654321',
          400: 'some-invalid-color',
          gold: 'hsl(41, 28.3%, 79.8%)',
          marine: 'rgb(4, 55, 242, 0.75)',
        },
      },
      screens: {
        'custom-screen': { min: '768px', max: '1024px' },
      },
    },
    supports: {
      grid: 'display: grid',
      flex: 'display: flex',
    },
  },
};

/**
 * Maps the nodes to plain objects: Jest fails to report differences of postcss nodes (they have circular references).
 */
function plainNodes(nodes: Array<{ rule: Rule; tailwindClasses: string[] }>) {
  return nodes.map(({ rule, tailwindClasses }) => ({
    selector: rule.selector,
    tailwindClasses,
  }));
}

function createTailwindConverter(config?: Partial<TailwindConverterConfig>) {
  return new TailwindConverter({
    remInPx: 16,
    postCSSPlugins: [require('postcss-nested')],
    tailwindConfig,
    ...(config || {}),
  });
}

describe('TailwindConverter', () => {
  it('should convert the simple CSS', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS(simpleCSS);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: '.foo',
        tailwindClasses: [
          'text-xs',
          'py-3',
          'hover:text-base',
          'md:font-semibold',
        ],
      },
    ]);
  });

  it('should consider `prefix`, `separator` and `corePlugins` configurations', async () => {
    const converter = createTailwindConverter({
      tailwindConfig: {
        content: [],
        prefix: 'tw-',
        separator: '_',
        corePlugins: {
          fontWeight: false,
          borderColor: false,
        },
      },
    });
    const converted = await converter.convertCSS(simpleCSS);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: '.foo',
        tailwindClasses: ['tw-text-xs', 'tw-py-3', 'hover_tw-text-base'],
      },
    ]);
  });

  it('should convert unconvertible declarations if `arbitraryPropertiesIsEnabled` config is enabled', async () => {
    const converter = createTailwindConverter({
      arbitraryPropertiesIsEnabled: true,
      tailwindConfig: {
        content: [],
        corePlugins: {
          borderColor: false,
        },
      },
    });
    const converted = await converter.convertCSS(simpleCSS);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: '.foo',
        tailwindClasses: [
          'text-xs',
          '[animation-delay:200ms]',
          '[border-right:2px_dashed]',
          'py-3',
          'hover:[filter:blur(4px)_brightness(0.5)_sepia(100%)_contrast(1)_hue-rotate(30deg)_invert(0)_opacity(0.05)_saturate(1.5)]',
          'hover:[transform:translateX(12px)_translateY(0.5em)_translateZ(0.5rem)_scaleY(0.725)_rotate(124deg)]',
          'hover:text-base',
          'md:font-semibold',
        ],
      },
    ]);
  });

  it('should not prefix arbitrary properties', async () => {
    const converter = createTailwindConverter({
      arbitraryPropertiesIsEnabled: true,
      tailwindConfig: {
        content: [],
        prefix: 'tw-',
        separator: '_',
        corePlugins: {
          borderColor: false,
        },
      },
    });
    const converted = await converter.convertCSS(simpleCSS);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: '.foo',
        tailwindClasses: [
          'tw-text-xs',
          '[animation-delay:200ms]',
          '[border-right:2px_dashed]',
          'tw-py-3',
          'hover_[filter:blur(4px)_brightness(0.5)_sepia(100%)_contrast(1)_hue-rotate(30deg)_invert(0)_opacity(0.05)_saturate(1.5)]',
          'hover_[transform:translateX(12px)_translateY(0.5em)_translateZ(0.5rem)_scaleY(0.725)_rotate(124deg)]',
          'hover_tw-text-base',
          'md_tw-font-semibold',
        ],
      },
    ]);
  });

  it('should return an empty result when converting an empty string', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS('');

    expect(converted.convertedRoot.toString()).toEqual('');
    expect(plainNodes(converted.nodes)).toEqual([]);
  });

  it('should convert the css part string', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS(
      '{ text-align: center; font-size: 12px; &:hover { font-size: 16px; } @media screen and (min-width: 768px) { font-weight: 600; } }'
    );
    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      expect.objectContaining({
        selector: '',
        tailwindClasses: [
          'text-center',
          'text-xs',
          'hover:text-base',
          'md:font-semibold',
        ],
      }),
    ]);
  });

  it('should convert rules with selectors that cannot be parsed in place', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS(
      'some invalid css string... .some-class { display: block; } ...'
    );

    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: 'some invalid css string... .some-class',
        tailwindClasses: ['block'],
      },
    ]);
  });

  it('should convert the complex CSS', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS(complexCSS);

    await expectValidConversion(converted, tailwindConfig);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: '.foo',
        tailwindClasses: ['md:accent-custom-color-gold'],
      },
      {
        selector: '.foo .baz',
        tailwindClasses: ['md:text-center'],
      },
      {
        selector: '.bar',
        tailwindClasses: ['md:content-center', 'md:items-start'],
      },
      {
        selector: '.foo',
        tailwindClasses: ['appearance-none'],
      },
      {
        selector: '.foo[some-attribute]',
        tailwindClasses: ['select-text'],
      },
      {
        selector: '.foo',
        tailwindClasses: [
          'aria-disabled:opacity-0',
          'aria-disabled:invisible',
          'aria-disabled:select-none',
        ],
      },
      {
        selector: '.foo',
        tailwindClasses: [
          'animate-spin',
          'aspect-video',
          'portrait:text-[black]',
          "after:content-['*']",
          'after:align-text-top',
          'after:origin-top',
        ],
      },
      {
        selector: ".foo [aria-role='button']",
        tailwindClasses: [
          'uppercase',
          'underline-offset-[1rem]',
          'touch-pan-left',
          'origin-bottom-right',
          'transition-none',
        ],
      },
      {
        selector: '.foo',
        tailwindClasses: [
          'aria-hidden:delay-150',
          'aria-hidden:duration-200',
          'aria-hidden:transition',
          'aria-hidden:ease-in',
          'aria-[hidden=false]:collapse',
          'aria-[hidden=false]:whitespace-pre-line',
          'aria-[hidden=false]:w-6/12',
          'aria-[hidden=false]:will-change-transform',
          'aria-[hidden=false]:break-all',
          'aria-[hidden=false]:z-40',
        ],
      },
      {
        selector: '.foo .bar',
        tailwindClasses: ['pl-[12%]', 'pr-[100vw]', 'pt-64', 'pb-1'],
      },
      {
        selector: '.foo .baz',
        tailwindClasses: [
          'place-content-around',
          'place-items-center',
          'place-self-stretch',
          'pointer-events-auto',
          'relative',
          'resize-x',
          '-right-32',
          'motion-safe:custom-screen:supports-flex:order-[-123]',
          'motion-safe:custom-screen:supports-flex:tracking-[0.25rem]',
          'motion-safe:custom-screen:supports-flex:leading-snug',
          'motion-safe:custom-screen:supports-flex:list-inside',
          'motion-safe:custom-screen:supports-flex:list-decimal',
          'motion-safe:custom-screen:supports-flex:max-h-full',
          'motion-safe:custom-screen:supports-flex:max-w-screen-2xl',
          'motion-safe:custom-screen:supports-flex:min-h-fit',
          'motion-safe:custom-screen:supports-flex:min-w-min',
          'motion-safe:custom-screen:supports-flex:mix-blend-color-dodge',
          'motion-safe:custom-screen:supports-flex:object-fill',
          'motion-safe:custom-screen:supports-flex:object-right-top',
          'motion-safe:custom-screen:supports-flex:ml-[2em]',
          'motion-safe:custom-screen:supports-flex:mr-[1vh]',
          'motion-safe:custom-screen:supports-flex:mt-[3vw]',
          'motion-safe:custom-screen:supports-flex:-mb-2.5',
          'motion-safe:custom-screen:supports-flex:left-2',
        ],
      },
      {
        selector: '.foo .baz > .foo-bar',
        tailwindClasses: [
          'text-left',
          'text-[length:var(--some-size)]',
          'text-[color:var(--some-color)]',
          'active:focus:break-after-avoid',
          'active:focus:break-before-left',
          'active:focus:break-inside-auto',
          'xl:isolate',
          'xl:justify-center',
        ],
      },
      {
        selector: '.foo div > [data-zoo]',
        tailwindClasses: [
          'border',
          'pl-[25%]',
          'pr-[1.5em]',
          'pt-0',
          'pb-px',
          'bottom-full',
        ],
      },
      {
        selector: '.bar',
        tailwindClasses: [
          'backdrop-brightness-75',
          'backdrop-sepia',
          'bg-local',
          'content-end',
          'items-center',
        ],
      },
      {
        selector: '.bar',
        tailwindClasses: [
          'animate-[some-animation_2s_linear_infinite]',
          'origin-[12%_25.5%]',
          'ease-[cubic-bezier(0.23,0,0.25,1)]',
          'lg:bg-blend-difference',
          'lg:bg-clip-padding',
          'lg:bg-[hsl(30,51%,22%)]',
          'lg:aria-disabled:bg-gradient-to-tr',
          'lg:aria-disabled:bg-origin-padding',
          'lg:aria-disabled:bg-left-bottom',
          'lg:aria-disabled:bg-no-repeat',
          'lg:aria-disabled:bg-contain',
          'lg:aria-disabled:border-b-2',
        ],
      },
      {
        selector: '.loving .bar > .testing',
        tailwindClasses: [
          "lg:bg-[url('/some-path/to/large\\_image.jpg')]",
          'lg:border-custom-color-gold',
          'lg:rounded-br-sm',
          'lg:rounded-bl',
          'lg:border-4',
          'lg:border-solid',
          'lg:border-separate',
        ],
      },
      {
        selector: '.bar::after',
        tailwindClasses: ['border-spacing-[5%]', 'rounded-full'],
      },
      {
        selector: '.bar:after',
        tailwindClasses: [
          'flex-1',
          'rounded-tl-none',
          'rounded-tr-[0.25%]',
          'border-dotted',
          'bottom-[100vw]',
        ],
      },
      {
        selector: '.bar',
        tailwindClasses: [
          'box-decoration-slice',
          'shadow',
          'box-border',
          'break-after-all',
          'break-before-page',
          'break-inside-avoid-column',
          'caret-[color:var(--cyan)]',
          'h-9',
          'flex-1',
          'xl:clear-both',
          'xl:text-lime-200',
          'xl:gap-x-48',
          'xl:columns-3',
          'xl:content-none',
          'xl:cursor-pointer',
          'xl:hidden',
          'xl:fill-sky-800',
          'xl:basis-3',
          'xl:flex-col-reverse',
          'xl:grow',
          'xl:shrink-0',
          'xl:float-right',
          'xl:text-2xl',
          'xl:antialiased',
          'xl:italic',
          'xl:ordinal',
          'xl:font-semibold',
        ],
      },
      {
        selector: '.foo .baz > .foo-bar',
        tailwindClasses: [
          'xl:active:text-sky-800',
          'xl:active:focus:justify-items-start',
          'xl:active:focus:justify-self-end',
          'motion-safe:custom-screen:supports-flex:opacity-20',
          'motion-safe:custom-screen:supports-flex:-order-last',
          'motion-safe:custom-screen:supports-flex:outline-offset-2',
          'motion-safe:custom-screen:supports-flex:break-words',
          'motion-safe:custom-screen:supports-flex:overflow-x-scroll',
          'motion-safe:custom-screen:supports-flex:overflow-y-visible',
          'motion-safe:custom-screen:supports-flex:overscroll-x-auto',
          'motion-safe:custom-screen:supports-flex:overscroll-y-none',
        ],
      },
      {
        selector: '.foo .baz',
        tailwindClasses: ['gap-[19px]', 'col-end-4', 'gap-x-12', 'col-start-3'],
      },
      {
        selector: '.foo .baz > .foo-bar',
        tailwindClasses: [
          'gap-8',
          'row-end-2',
          'gap-y-6',
          'row-start-auto',
          'grid-cols-2',
          'grid-rows-5',
          'h-[$some-invalid]',
          'active:text-[red]',
        ],
      },
      {
        selector: '#some-id',
        tailwindClasses: [
          'opacity-40',
          'order-last',
          'outline-offset-2',
          'supports-[display:block]:gap-y-80',
          'supports-[display:block]:scroll-smooth',
          'supports-[display:block]:scroll-ml-2',
          'supports-[display:block]:scroll-mr-[1.5em]',
          'supports-[display:block]:scroll-mt-40',
          'supports-[display:block]:scroll-mb-8',
        ],
      },
      {
        selector: '.foo .baz',
        tailwindClasses: [
          'supports-[scroll-snap-align:end]:snap-end',
          'supports-[scroll-snap-align:end]:snap-always',
          'supports-[scroll-snap-align:end]:line-through',
          'supports-[scroll-snap-align:end]:scroll-mt-[12%]',
          'supports-[scroll-snap-align:end]:scroll-pl-3.5',
          'supports-[scroll-snap-align:end]:scroll-pr-[10vw]',
          'supports-[scroll-snap-align:end]:scroll-pt-[10em]',
          'supports-[scroll-snap-align:end]:scroll-pb-5',
        ],
      },
      {
        selector: 'div > [data-zoo]',
        tailwindClasses: [
          'stroke-[black]',
          'stroke-2',
          'table-fixed',
          'text-justify',
          'indent-0.5',
          'text-ellipsis',
        ],
      },
    ]);
  });

  it('should convert border with color correctly even if width is missing', async () => {
    const converter = createTailwindConverter();
    const css = `
      td {
        border: solid rgba(148, 163, 184, 0.1);
      }
      .a {
        border: rgba(148, 163, 184, 0.1) 0 dotted;
      }
      .b {
        border: rgba(148, 163, 184, 0.1);
      }`;
    const converted = await converter.convertCSS(css);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: 'td',
        tailwindClasses: [
          'border-[medium]',
          'border-solid',
          'border-[rgba(148,163,184,0.1)]',
        ],
      },
      {
        selector: '.a',
        tailwindClasses: [
          'border-0',
          'border-dotted',
          'border-[rgba(148,163,184,0.1)]',
        ],
      },
      {
        selector: '.b',
        tailwindClasses: ['border-none', 'border-[rgba(148,163,184,0.1)]'],
      },
    ]);
  });

  it('should convert border width on shorthand correctly', async () => {
    const converter = createTailwindConverter();
    const css = `
      td {
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
      .a {
        border-color: rgba(148, 163, 184, 0.1);
        border-width: 1px 2px;
      }
      .b {
        border-color: rgba(148, 163, 184, 0.1);
        border-width: 2px;
      }
      .c {
        border-color: rgba(148, 163, 184, 0.1);
        border-width: 1px 0px 3px;
      }
      .d {
        border-color: rgba(148, 163, 184, 0.1);
        border-width: 1px 0px 2px;
      }
      .f {
        border-color: rgba(148, 163, 184, 0.1);
        border-width: 1px 3px 2px 4.5em;
      }
      .g {
        border: 4.5em solid;
      }
      .h {
        border-color: rgba(148, 163, 184, 0.1);
        border-width: 1px 2px 1px 2px;
      }`;
    const converted = await converter.convertCSS(css);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: 'td',
        tailwindClasses: [
          'border',
          'border-solid',
          'border-[rgba(148,163,184,0.1)]',
        ],
      },
      {
        selector: '.a',
        tailwindClasses: [
          'border-x-2',
          'border-[rgba(148,163,184,0.1)]',
          'border-y',
        ],
      },
      {
        selector: '.b',
        tailwindClasses: ['border-[rgba(148,163,184,0.1)]', 'border-2'],
      },
      {
        selector: '.c',
        tailwindClasses: [
          'border-b-[3px]',
          'border-x-0',
          'border-[rgba(148,163,184,0.1)]',
          'border-t',
        ],
      },
      {
        selector: '.d',
        tailwindClasses: [
          'border-b-2',
          'border-x-0',
          'border-[rgba(148,163,184,0.1)]',
          'border-t',
        ],
      },
      {
        selector: '.f',
        tailwindClasses: [
          'border-l-[4.5em]',
          'border-r-[3px]',
          'border-b-2',
          'border-[rgba(148,163,184,0.1)]',
          'border-t',
        ],
      },
      {
        selector: '.g',
        tailwindClasses: ['border-[4.5em]', 'border-solid', 'border-current'],
      },
      {
        selector: '.h',
        tailwindClasses: [
          'border-x-2',
          'border-[rgba(148,163,184,0.1)]',
          'border-y',
        ],
      },
    ]);
  });

  it('should convert border width values that contain functions or variables, unless the sides are ambiguous', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS(`
      .a {
        border: calc(1px + 1px) solid red;
      }
      .b {
        border-width: var(--width);
      }
      .c {
        border-width: var(--width) 0;
      }
    `);

    expect(plainNodes(converted.nodes)).toEqual([
      {
        selector: '.a',
        tailwindClasses: [
          'border-[calc(1px_+_1px)]',
          'border-solid',
          'border-[red]',
        ],
      },
      {
        selector: '.b',
        tailwindClasses: ['border-[length:var(--width)]'],
      },
    ]);
  });
});
