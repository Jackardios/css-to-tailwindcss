import { TailwindConverter } from '../src/TailwindConverter';
import fs from 'fs';
import path from 'path';

const inputCSS: string = fs
  .readFileSync(path.resolve(__dirname, './fixtures/input.css'))
  .toString();

function createTailwindConverter() {
  return new TailwindConverter({
    remInPx: 16,
    postCSSPlugins: [require('postcss-nested')],
    tailwindConfig: {
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
    },
  });
}

describe('TailwindConverter', () => {
  test('converting css string returns tailwind nodes', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS(inputCSS);

    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(converted.nodes).toEqual([
      {
        rule: expect.objectContaining({ selector: '.foo' }),
        tailwindClasses: [
          'accent-custom-color-gold',
          'content-center',
          'items-start',
          'animate-spin',
          'appearance-none',
          'aspect-video',
          'content-center',
          'content-end',
          "after:content-['*']",
          'after:select-text',
          'after:align-text-top',
          'after:origin-top',
          'hidden:delay-150',
          'hidden:duration-200',
          'hidden:transition',
          'hidden:ease-in',
        ],
      },
      {
        rule: expect.objectContaining({
          selector: ".foo [aria-role='button']",
        }),
        tailwindClasses: [
          'uppercase',
          'underline-offset-[1rem]',
          'touch-pan-left',
          'origin-bottom-right',
          'transition-none',
          'top-3',
        ],
      },
      {
        rule: expect.objectContaining({
          selector: ".foo[aria-hidden='false']",
        }),
        tailwindClasses: [
          'collapse',
          'whitespace-pre-line',
          'w-6/12',
          'will-change-transform',
          'break-all',
          'z-40',
          'translate-x-3',
          'translate-y-[-0.5em]',
          'skew-x-1',
          'skew-y-3',
          'rotate-[-0.25turn]',
          'transition-colors',
          'duration-200',
          'ease-out',
          '-scale-x-75',
          'scale-y-105',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.foo .bar' }),
        tailwindClasses: [
          'translate-x-[10px_0.625rem]',
          'skew-x-2',
          '-rotate-45',
          'pl-[12%]',
          'pr-[100vw]',
          'pt-64',
          'pb-1',
          'px-6',
          'py-8',
          '-scale-75',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.foo .baz' }),
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
          'motion-safe:custom-screen:supports-flex:mb-[-0.875rem]',
          'motion-safe:custom-screen:supports-flex:max-h-full',
          'motion-safe:custom-screen:supports-flex:max-w-screen-2xl',
          'motion-safe:custom-screen:supports-flex:min-h-fit',
          'motion-safe:custom-screen:supports-flex:min-w-min',
          'motion-safe:custom-screen:supports-flex:mix-blend-color-dodge',
          'motion-safe:custom-screen:supports-flex:object-fill',
          'motion-safe:custom-screen:supports-flex:object-right-top',
          'motion-safe:custom-screen:supports-flex:ml-[2em]',
          'motion-safe:custom-screen:supports-flex:mr-[1vh]',
          'motion-safe:custom-screen:supports-flex:mt-3',
          'motion-safe:custom-screen:supports-flex:mt-[3vw]',
          'motion-safe:custom-screen:supports-flex:-mb-2.5',
          'motion-safe:custom-screen:supports-flex:mx-6',
          'motion-safe:custom-screen:supports-flex:left-2',
          'supports-[scroll-snap-align:end]:snap-end',
          'supports-[scroll-snap-align:end]:snap-always',
          'supports-[scroll-snap-align:end]:line-through',
          'supports-[scroll-snap-align:end]:scroll-mt-[12%]',
          'supports-[scroll-snap-align:end]:scroll-pl-3.5',
          'supports-[scroll-snap-align:end]:scroll-pr-[10vw]',
          'supports-[scroll-snap-align:end]:scroll-pt-[10em]',
          'supports-[scroll-snap-align:end]:scroll-pb-5',
          'supports-[scroll-snap-align:end]:scroll-p-[100px]',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.foo .baz > .foo-bar' }),
        tailwindClasses: [
          'text-left',
          'text-[var(--some-size)]',
          'text-[var(--some-color)]',
          'active:focus:break-after-avoid',
          'active:focus:break-before-left',
          'active:focus:break-inside-auto',
          'xl:isolate',
          'xl:justify-center',
          'xl:active:text-sky-800',
          'xl:active:focus:justify-items-start',
          'xl:active:focus:justify-self-end',
          'motion-safe:custom-screen:supports-flex:opacity-20',
          'motion-safe:custom-screen:supports-flex:-order-last',
          'motion-safe:custom-screen:supports-flex:outline-lime-600',
          'motion-safe:custom-screen:supports-flex:outline-offset-2',
          'motion-safe:custom-screen:supports-flex:outline-dotted',
          'motion-safe:custom-screen:supports-flex:outline-2',
          'motion-safe:custom-screen:supports-flex:overflow-hidden',
          'motion-safe:custom-screen:supports-flex:break-words',
          'motion-safe:custom-screen:supports-flex:overflow-x-scroll',
          'motion-safe:custom-screen:supports-flex:overflow-y-visible',
          'motion-safe:custom-screen:supports-flex:overscroll-contain',
          'motion-safe:custom-screen:supports-flex:overscroll-x-auto',
          'motion-safe:custom-screen:supports-flex:overscroll-y-none',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.foo div > [data-zoo]' }),
        tailwindClasses: [
          'border',
          'pl-[25%]',
          'pr-[1.5em]',
          'pt-2',
          'pb-px',
          'bottom-full',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.bar' }),
        tailwindClasses: [
          'backdrop-brightness-90',
          'backdrop-sepia-[25%]',
          'backdrop-blur-none',
          'animate-[some-animation_2s_linear_infinite]',
          'origin-[12%_25.5%]',
          'ease-[cubic-bezier(0.23,0,0.25,1)]',
          'lg:backdrop-brightness-75',
          'lg:backdrop-sepia',
          'lg:bg-local',
          'lg:bg-blend-difference',
          'lg:bg-clip-padding',
          'lg:bg-[hsl(30,51%,22%)]',
          'lg:disabled:bg-gradient-to-tr',
          'lg:disabled:bg-origin-padding',
          'lg:disabled:bg-left-bottom',
          'lg:disabled:bg-no-repeat',
          'lg:disabled:bg-contain',
          'lg:disabled:border-b-2',
          'after:border-spacing-[5%]',
          'after:rounded-full',
          'after:border-l-[3px]',
          'after:border-l-transparent',
          'after:border-l-[1rem]',
          'after:border-r-2',
          'after:border-r-[aqua]',
          'after:border-r-8',
          'after:border-dashed',
          'after:border-t-[some-invalid-value]',
          'after:rounded-tl-none',
          'after:rounded-tr-[0.25%]',
          'after:border-t-[current]',
          'after:border-t-[100vh]',
          'after:border-dotted',
          'after:border-8',
          'after:bottom-[100vw]',
          'box-decoration-slice',
          'shadow',
          'box-border',
          'break-after-all',
          'break-before-page',
          'break-inside-avoid-column',
          'caret-[var(--cyan)]',
          'h-9',
          'xl:clear-both',
          'xl:text-lime-200',
          'xl:gap-x-48',
          'xl:columns-3',
          'xl:content-none',
          'xl:cursor-pointer',
          'xl:hidden',
          'xl:fill-sky-800',
          'xl:blur-sm',
          'xl:brightness-50',
          'xl:sepia',
          'xl:contrast-100',
          'xl:hue-rotate-30',
          'xl:invert-0',
          'xl:opacity-5',
          'xl:saturate-150',
          'xl:flex-auto',
          'xl:basis-3',
          'xl:flex-col-reverse',
          'xl:grow',
          'xl:shrink-0',
          'xl:flex-wrap-reverse',
          'xl:float-right',
          'xl:text-2xl',
          'xl:antialiased',
          'xl:italic',
          'xl:ordinal',
          'xl:font-semibold',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.loving .bar > .testing' }),
        tailwindClasses: [
          "bg-[url('/some-path/to/large\\_image.jpg')]",
          'border-custom-color-gold',
          'border-b-custom-color-200',
          'border-b-[var(--some-size)]',
          'border-neutral-600',
          'border-t-custom-color-400',
          'rounded-br-sm',
          'rounded-bl',
          'border-b-[2em]',
          'border-b-[#ff0000]',
          'border-4',
          'border-solid',
          'border-dashed',
          'border-separate',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.foo .baz' }),
        tailwindClasses: [
          'gap-[19px]',
          'auto-cols-min',
          'grid-flow-row',
          'auto-rows-max',
          'col-span-3',
          'col-end-4',
          'gap-x-12',
          'col-start-3',
        ],
      },
      {
        rule: expect.objectContaining({ selector: '.foo .baz > .foo-bar' }),
        tailwindClasses: [
          'gap-8',
          'row-span-full',
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
        rule: expect.objectContaining({ selector: '#some-id' }),
        tailwindClasses: [
          'opacity-40',
          'order-last',
          'outline-teal-900',
          'outline-offset-2',
          'outline-8',
          'supports-[display:block]:gap-y-80',
          'supports-[display:block]:scroll-smooth',
          'supports-[display:block]:scroll-ml-2',
          'supports-[display:block]:scroll-mr-[1.5em]',
          'supports-[display:block]:scroll-mb-8',
          'supports-[display:block]:scroll-m-40',
        ],
      },
      {
        rule: expect.objectContaining({ selector: 'div > [data-zoo]' }),
        tailwindClasses: [
          'stroke-[black]',
          'stroke-2',
          'table-fixed',
          'text-justify',
          'decoration-custom-color-gold',
          'line-through',
          'decoration-dotted',
          'decoration-8',
          'indent-[0.125rem]',
          'text-ellipsis',
        ],
      },
    ]);
  });

  test('converting empty string', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS('');

    expect(converted.convertedRoot.toString()).toEqual('');
    expect(converted.nodes).toEqual([]);
  });

  test('converting css part string', async () => {
    const converter = createTailwindConverter();
    const converted = await converter.convertCSS(
      '{ text-align: center; font-size: 12px; &:hover { font-size: 16px; } @media screen and (min-width: 768px) { font-weight: 600; } }'
    );
    expect(converted.convertedRoot.toString()).toMatchSnapshot();
    expect(converted.nodes).toEqual([
      expect.objectContaining({
        rule: expect.objectContaining({ selector: '' }),
        tailwindClasses: [
          'text-center',
          'text-xs',
          'hover:text-base',
          'md:font-semibold',
        ],
      }),
    ]);
  });

  test('converting invalid css string throws error', async () => {
    const converter = createTailwindConverter();
    await expect(
      converter.convertCSS(
        'some invalid css string... .some-class { display: block; } ...'
      )
    ).rejects.toThrow(Error);
  });
});
