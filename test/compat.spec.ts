import fs from 'fs';
import path from 'path';
import type { Selector } from 'css-what';
import postcss, { AtRule, Container, Declaration, Root, Rule } from 'postcss';
import postcssJs from 'postcss-js';

import * as publicApi from '../src';
import { TailwindNodesManager } from '../src/TailwindNodesManager';
import {
  TailwindConverter,
  TailwindConverterConfig,
} from '../src/TailwindConverter';
import { normalizeCSS } from './helpers/convert';
import { collectClasses, expectValidConversion } from './helpers/tailwind';

/**
 * Runtime exports of every module of the last 1.x release: consumers may import them from `lib/*`.
 */
const MODULE_EXPORTS: Record<string, string[]> = {
  TailwindConverter: ['DEFAULT_CONVERTER_CONFIG', 'TailwindConverter'],
  TailwindNodesManager: [
    'TailwindNodesManager',
    'isResolvedTailwindNode',
    'isUnresolvedTailwindNode',
  ],
  index: ['DEFAULT_CONVERTER_CONFIG', 'TailwindConverter'],
  'mappings/declaration-converters-mapping': [
    'DECLARATION_CONVERTERS_MAPPING',
    'convertComposedSpacingDeclarationValue',
    'convertDeclarationValue',
    'prepareArbitraryValue',
    'strictConvertDeclarationValue',
  ],
  'mappings/media-params-mapping': ['MEDIA_PARAMS_MAPPING'],
  'mappings/pseudos-mapping': ['PSEUDOS_MAPPING'],
  'mappings/utilities-mapping': ['UTILITIES_MAPPING'],
  'utils/buildMediaQueryByScreen': ['buildMediaQueryByScreen'],
  'utils/converterMappingByTailwindTheme': [
    'converterMappingByTailwindTheme',
    'normalizeAtRuleParams',
    'normalizeColorValue',
    'normalizeSizeValue',
    'normalizeValue',
    'normalizeZeroSizeValue',
  ],
  'utils/detectIndent': ['detectIndent'],
  'utils/flattenObject': ['flattenObject'],
  'utils/isAtRuleNode': ['isAtRuleNode'],
  'utils/isCSSVariable': ['isCSSVariable'],
  'utils/isChildNode': ['isChildNode'],
  'utils/isObject': ['isObject'],
  'utils/normalizeNumbersInString': ['normalizeNumbersInString'],
  'utils/parseCSSFunction': ['parseCSSFunction'],
  'utils/parseCSSFunctions': ['parseCSSFunctions'],
  'utils/reduceTailwindClasses': ['reduceTailwindClasses'],
  'utils/remValueToPx': ['remValueToPx'],
  'utils/removeUnnecessarySpaces': ['removeUnnecessarySpaces'],
  'utils/resolveConfig': ['resolveConfig'],
};

/** Protected methods that subclasses may override or call. */
const PROTECTED_METHODS = [
  'cleanRaws',
  'convertRule',
  'convertDeclarationToClasses',
  'makeTailwindNode',
  'parseSelector',
  'convertSelectorToClassPrefix',
  'attributeSelectorToMappingKey',
  'convertContainerToClassPrefix',
  'convertMediaParamsToClassPrefix',
  'convertSupportsParamsToClassPrefix',
];

describe('1.x compatibility', () => {
  it.each(Object.entries(MODULE_EXPORTS))(
    'keeps the exports of %s',
    (modulePath, exportNames) => {
      const loaded = require(`../src/${modulePath}`);

      exportNames.forEach(exportName => {
        expect(loaded[exportName]).toBeDefined();
      });
    }
  );

  it('keeps the public API', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      ['DEFAULT_CONVERTER_CONFIG', 'TailwindConverter'].sort()
    );
    expect(publicApi.DEFAULT_CONVERTER_CONFIG).toEqual(
      expect.objectContaining({
        postCSSPlugins: [],
        arbitraryPropertiesIsEnabled: false,
      })
    );
  });

  it('keeps the protected methods', () => {
    PROTECTED_METHODS.forEach(method => {
      expect(typeof (TailwindConverter.prototype as any)[method]).toBe(
        'function'
      );
    });
  });

  it('keeps the behavior of the protected helpers', () => {
    class CustomConverter extends TailwindConverter {
      check() {
        return {
          selector: this.parseSelector('.foo .bar:hover'),
          media: this.convertMediaParamsToClassPrefix([
            'screen and (min-width: 768px)',
          ]),
          unknownMedia: this.convertMediaParamsToClassPrefix([
            'print and (foo)',
          ]),
          supports: this.convertSupportsParamsToClassPrefix([
            '(display: grid)',
          ]),
          declaration: this.convertDeclarationToClasses({
            prop: 'margin-top',
            value: '16px',
          } as any),
        };
      }
    }

    expect(
      new CustomConverter({
        remInPx: 16,
        tailwindConfig: { content: [], separator: '_' },
      }).check()
    ).toEqual({
      selector: { baseSelector: '.foo .bar', classPrefix: 'hover_' },
      media: 'md_',
      unknownMedia: '',
      supports: 'supports-[display:grid]_',
      declaration: ['mt-4'],
    });
  });

  describe('subclasses overriding the 1.x methods', () => {
    const css =
      '.a { color: red } .a:hover { color: blue } .g:hover .a { color: green } ' +
      '@media (min-width: 768px) { .a { margin: 8px } } ' +
      '@supports (display: grid) { .a { display: grid } }';

    const subclasses: Array<[string, typeof TailwindConverter, string]> = [
      [
        'convertDeclarationToClasses',
        class extends TailwindConverter {
          protected convertDeclarationToClasses(declaration: Declaration) {
            return declaration.prop === 'color'
              ? [`text-x-${declaration.value}`]
              : super.convertDeclarationToClasses(declaration);
          }
        },
        '.a{@apply text-x-red hover:text-x-blue md:m-2 supports-[display:grid]:grid}.g:hover .a{@apply text-x-green}',
      ],
      [
        'convertSelectorToClassPrefix',
        class extends TailwindConverter {
          protected convertSelectorToClassPrefix(selector: Selector) {
            return selector.type === 'pseudo' && selector.name === 'hover'
              ? 'hocus:'
              : super.convertSelectorToClassPrefix(selector);
          }
        },
        '.a{@apply text-[red] hocus:text-[blue] md:m-2 supports-[display:grid]:grid}.g:hover .a{@apply text-[green]}',
      ],
      [
        'parseSelector',
        class extends TailwindConverter {
          protected parseSelector(rawSelector: string) {
            return rawSelector === '.g:hover .a'
              ? { baseSelector: '.a', classPrefix: 'group-hover:' }
              : super.parseSelector(rawSelector);
          }
        },
        // the order of `group-hover` and `hover` is unknown, so a new rule is created
        '.a{@apply text-[red] hover:text-[blue]}.a{@apply group-hover:text-[green] md:m-2 supports-[display:grid]:grid}',
      ],
      [
        'convertMediaParamsToClassPrefix',
        class extends TailwindConverter {
          protected convertMediaParamsToClassPrefix() {
            return 'tablet:';
          }
        },
        '.a{@apply text-[red] hover:text-[blue] tablet:m-2 supports-[display:grid]:grid}.g:hover .a{@apply text-[green]}',
      ],
      [
        'convertSupportsParamsToClassPrefix',
        class extends TailwindConverter {
          protected convertSupportsParamsToClassPrefix(params: string[]) {
            return params.length ? 'grid-ok:' : '';
          }
        },
        '.a{@apply text-[red] hover:text-[blue] md:m-2 grid-ok:grid}.g:hover .a{@apply text-[green]}',
      ],
      [
        'convertContainerToClassPrefix',
        class extends TailwindConverter {
          protected convertContainerToClassPrefix(container?: Container) {
            return container?.type === 'atrule' ? 'ctx:' : '';
          }
        },
        '.a{@apply text-[red] hover:text-[blue] ctx:m-2 ctx:grid}.g:hover .a{@apply text-[green]}',
      ],
      [
        'convertRule',
        class extends TailwindConverter {
          protected convertRule(rule: Rule) {
            const node = super.convertRule(rule);
            node?.tailwindClasses.push('custom');

            return node;
          }
        },
        '.a{@apply text-[red] custom hover:text-[blue] hover:custom md:m-2 md:custom supports-[display:grid]:grid supports-[display:grid]:custom}.g:hover .a{@apply text-[green] custom}',
      ],
      [
        'makeTailwindNode',
        class extends TailwindConverter {
          protected makeTailwindNode(rule: Rule, tailwindClasses: string[]) {
            return super.makeTailwindNode(rule, [...tailwindClasses, 'custom']);
          }
        },
        '.a{@apply text-[red] custom hover:text-[blue] hover:custom md:m-2 md:custom supports-[display:grid]:grid supports-[display:grid]:custom}.g:hover .a{@apply text-[green] custom}',
      ],
    ];

    it.each(subclasses)(
      'uses the overridden %s',
      async (_, Converter, expected) => {
        const result = await new Converter({ remInPx: 16 }).convertCSS(css);

        expect(normalizeCSS(result.convertedRoot.toString())).toBe(expected);
      }
    );
  });

  it('keeps TailwindNodesManager working for rules at the root', () => {
    const root = postcss.parse('.a:hover { color: red }');
    const originalRule = root.first as Rule;
    const manager = new TailwindNodesManager();

    manager.mergeNode({
      key: '.a',
      rootRuleSelector: '.a',
      originalRule,
      classesPrefix: 'hover:',
      tailwindClasses: ['text-[red]'],
    });

    // the base rule is created before the variant rule instead of being lost
    expect(root.nodes.map(node => (node as Rule).selector)).toEqual([
      '.a',
      '.a:hover',
    ]);
    expect(
      manager.getNodes().map(({ rule, tailwindClasses }) => ({
        selector: rule.selector,
        tailwindClasses,
      }))
    ).toEqual([{ selector: '.a', tailwindClasses: ['hover:text-[red]'] }]);
  });

  it('keeps the shape of the result', async () => {
    const result = await new TailwindConverter({
      postCSSPlugins: [require('postcss-nested')],
    }).convertCSS('.foo { color: red; &:hover { display: block } }');

    expect(result.convertedRoot).toBeInstanceOf(Root);
    expect(result.nodes).toEqual([
      {
        rule: expect.any(Rule),
        tailwindClasses: ['text-[red]', 'hover:block'],
      },
    ]);
    expect(result.nodes[0].rule.selector).toBe('.foo');
    expect(result.nodes[0].rule.first).toEqual(
      expect.objectContaining({ type: 'atrule', name: 'apply' })
    );
    expect((result.nodes[0].rule.first as AtRule).params).toBe(
      'text-[red] hover:block'
    );
  });

  describe('VS Code extension', () => {
    // mirrors vscode-css-to-tailwindcss/src/utils/converter.ts
    const converter = new TailwindConverter({
      postCSSPlugins: [require('postcss-nested')],
      remInPx: 16,
      arbitraryPropertiesIsEnabled: false,
    } as Partial<TailwindConverterConfig>);

    // nanoid ids may start with a digit, `-` or `_`
    it.each(['V1StGXR8_Z5jdHi6B-myT', '9abcDEF_ghi-jkl', '-4bc_def', '_abc-9'])(
      'keeps the wrapper selector %s',
      async id => {
        const converted = await converter.convertCSS(
          `${id} { color: red; margin: 4px; &:hover { color: blue; } ` +
            '@media (min-width: 768px) { padding: 8px; } &::after { content: "x" } }'
        );
        const jss = postcssJs.objectify(converted.convertedRoot);

        expect(Object.keys(jss)).toEqual([id]);
        expect(jss[id]).toEqual({
          '@apply text-[red] m-1 hover:text-[blue] md:p-2 after:content-["x"]':
            true,
        });
      }
    );

    it('splits the wrapper rule when merging would change the cascade', async () => {
      const id = 'abc';
      const converted = await converter.convertCSS(
        `${id} { color: red; .child { color: green } &:hover { color: blue } }`
      );

      // `.child` may match the hovered element, so `hover:` utilities can't be moved above it
      expect(converted.nodes.map(({ rule }) => rule.selector)).toEqual([
        id,
        `${id} .child`,
        id,
      ]);
      expect(postcssJs.objectify(converted.convertedRoot)).toEqual({
        [id]: {
          '@apply text-[red]': true,
          '@apply hover:text-[blue]': true,
        },
        [`${id} .child`]: { '@apply text-[green]': true },
      });
    });

    it('keeps unconvertible declarations under the wrapper selector', async () => {
      const id = 'abc';
      const converted = await converter.convertCSS(
        `${id} { color: red; filter: blur(1px) blur(2px); &:hover { display: -webkit-box; display: flex } }`
      );
      const jss = postcssJs.objectify(converted.convertedRoot);

      expect(jss).toEqual({
        [id]: {
          '@apply text-[red]': true,
          filter: 'blur(1px) blur(2px)',
        },
        [`${id}:hover`]: { display: ['-webkit-box', 'flex'] },
      });
    });
  });

  it('converts the README example', async () => {
    const readme = fs
      .readFileSync(path.resolve(__dirname, '../README.md'))
      .toString();
    const inputCSS = readme.match(/const inputCSS = `([\s\S]*?)`;/)?.[1];
    const expectedCSS = readme.match(
      /`convertedRoot\.toString\(\)`:[\s\S]*?```css\n([\s\S]*?)```/
    )?.[1];
    const tailwindConfig = {
      content: [],
      theme: {
        extend: {
          colors: {
            'custom-color': {
              100: '#123456',
              200: 'hsla(210, 100%, 51.0%, 0.016)',
              300: '#654321',
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

    const result = await new TailwindConverter({
      remInPx: 16,
      postCSSPlugins: [require('postcss-nested')],
      tailwindConfig,
    }).convertCSS(inputCSS as string);

    await expectValidConversion(result, tailwindConfig);
    expect(result.convertedRoot.toString().trim()).toBe(expectedCSS?.trim());
    expect(collectClasses(result).length).toBeGreaterThan(0);
  });
});
