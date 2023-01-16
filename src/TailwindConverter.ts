import type { AttributeSelector, Selector } from 'css-what';
import {
  AcceptedPlugin,
  AtRule,
  Container,
  Declaration,
  Document,
  Rule,
} from 'postcss';
import type { Config } from 'tailwindcss';
import type { ConverterMapping } from './types/ConverterMapping';

import postcss from 'postcss';
import postcssSafeParser from 'postcss-safe-parser';
import resolveConfig from 'tailwindcss/resolveConfig';
import { parse, stringify } from 'css-what';

import {
  isResolvedTailwindNode,
  isUnresolvedTailwindNode,
  TailwindNode,
  TailwindNodesManager,
} from './TailwindNodesManager';
import { isAtRuleNode } from './utils/isAtRuleNode';
import {
  converterMappingByTailwindTheme,
  normalizeAtRuleParams,
} from './utils/converterMappingByTailwindTheme';
import {
  convertDeclarationValue,
  TAILWIND_DECLARATION_CONVERTERS,
} from './constants/converters';
import { isChildNode } from './utils/isChildNode';
import { MEDIA_PARAMS_MAPPING } from './constants/media-params-mapping';
import { removeUnnecessarySpaces } from './utils/removeUnnecessarySpaces';
import { reduceTailwindClasses } from './utils/reduceTailwindClasses';

export interface TailwindConverterConfig {
  remInPx?: number | null;
  tailwindConfig: Config;
  postCSSPlugins: AcceptedPlugin[];
}

export interface ResolvedTailwindConverterConfig
  extends TailwindConverterConfig {
  mapping: ConverterMapping;
}

export const DEFAULT_CONVERTER_CONFIG: Omit<
  TailwindConverterConfig,
  'tailwindConfig'
> = {
  postCSSPlugins: [],
};

export class TailwindConverter {
  protected config: ResolvedTailwindConverterConfig;

  constructor({
    tailwindConfig,
    ...converterConfig
  }: Partial<TailwindConverterConfig> = {}) {
    const resolvedTailwindConfig = resolveConfig(
      tailwindConfig || ({} as Config)
    );

    this.config = {
      ...DEFAULT_CONVERTER_CONFIG,
      ...converterConfig,
      tailwindConfig: resolvedTailwindConfig,
      mapping: converterMappingByTailwindTheme(
        resolvedTailwindConfig.theme,
        converterConfig.remInPx
      ),
    };
  }

  async convertCSS(css: string) {
    const nodesManager = new TailwindNodesManager();
    const parsed = await postcss(this.config.postCSSPlugins).process(css, {
      parser: postcssSafeParser,
    });

    parsed.root.walkRules(rule => {
      const converted = this.convertRule(rule);
      if (converted) {
        nodesManager.mergeNode(converted);
      }
    });

    const nodes = nodesManager.getNodes();
    nodes.forEach(node => {
      node.rule.prepend(
        new AtRule({
          name: 'apply',
          params: node.tailwindClasses.join(' '),
        })
      );
    });

    // clean empty rules and at-rules
    parsed.root.walkRules(node => {
      if (node.nodes?.length === 0) {
        node.remove();
      }
    });
    parsed.root.walkAtRules(node => {
      if (node.nodes?.length === 0) {
        node.remove();
      }
    });

    return {
      nodes,
      convertedRoot: parsed.root,
    };
  }

  protected convertRule(rule: Rule): TailwindNode | null {
    let tailwindClasses: string[] = [];

    rule.walkDecls(declaration => {
      const converted = this.convertDeclarationToClasses(declaration);

      if (converted?.length) {
        declaration.remove();
        tailwindClasses = tailwindClasses.concat(converted);
      }
    });

    if (tailwindClasses.length) {
      return this.makeTailwindNode(
        rule,
        reduceTailwindClasses(tailwindClasses)
      );
    }

    return null;
  }

  protected convertDeclarationToClasses(declaration: Declaration) {
    return (
      TAILWIND_DECLARATION_CONVERTERS[declaration.prop]?.(
        declaration,
        this.config
      ) || []
    );
  }

  protected makeTailwindNode(rule: Rule, tailwindClasses: string[]) {
    const parsedSelector = parse(rule.selector);
    let tailwindNode: TailwindNode = { rule, tailwindClasses };

    if (parsedSelector.length === 1) {
      const firstParsedSelector = parsedSelector[0];
      const baseSelectors: Array<Selector> = [];
      const converted: Array<string> = [];

      firstParsedSelector?.forEach(item => {
        const convertedSelector = this.convertSelector(item);

        if (convertedSelector) {
          converted.push(convertedSelector);
        } else if (item.type === 'tag' || item.type === 'attribute') {
          baseSelectors.push(item);
        }
      });

      const isComplexSelector =
        baseSelectors.length + converted.length !== firstParsedSelector.length;

      if (!isComplexSelector) {
        const classesPrefix = converted.join('');

        tailwindNode = {
          key: stringify([baseSelectors]),
          fallbackRule: rule,
          classesPrefixWhenFound: classesPrefix,
          tailwindClasses,
        };
      }
    }

    const classPrefix = this.convertContainerToClassPrefix(rule.parent);

    if (classPrefix) {
      tailwindNode = isResolvedTailwindNode(tailwindNode)
        ? {
            key: tailwindNode.rule.selector,
            fallbackRule: rule,
            classesPrefixWhenFound: classPrefix,
            tailwindClasses,
          }
        : {
            key: tailwindNode.key,
            fallbackRule: rule,
            classesPrefixWhenFound:
              classPrefix + tailwindNode.classesPrefixWhenFound,
            tailwindClasses,
          };
    } else if (isUnresolvedTailwindNode(tailwindNode)) {
      tailwindNode.key = TailwindNodesManager.convertRuleToKey(
        rule.clone({ selector: tailwindNode.key })
      );
    }

    return tailwindNode;
  }

  protected convertSelector(selector: Selector) {
    if (selector.type === 'pseudo' || selector.type === 'pseudo-element') {
      return (
        {
          'file-selector-button': 'file:',
          'last-child': 'last:',
          'only-child': 'only:',
          'nth-child(odd)': 'odd:',
          'nth-child(2n+1)': 'odd:',
          'nth-child(even)': 'even:',
          'nth-child(2n)': 'even:',
        }[selector.name] || `${selector.name}:`
      );
    }

    if (selector.type === 'attribute') {
      if (selector.name.startsWith('aria-')) {
        const mappingKey = this.attributeSelectorToMappingKey(selector, 6);
        const mapped = this.config.mapping.aria?.[mappingKey];

        if (!mapped) {
          return null;
        }

        return `${mapped}:`;
      }

      if (selector.name.startsWith('data-')) {
        const mappingKey = this.attributeSelectorToMappingKey(selector, 6);
        const mapped = this.config.mapping.data?.[mappingKey];

        if (!mapped) {
          return null;
        }

        return `${mapped}:`;
      }
    }

    return null;
  }

  protected attributeSelectorToMappingKey(
    selector: AttributeSelector,
    from = 1
  ) {
    const stringifiedSelector = stringify([[selector]]);

    return stringifiedSelector.substring(from, stringifiedSelector.length - 1);
  }

  protected convertContainerToClassPrefix(container: Container | undefined) {
    let currentContainer: Document | Container | undefined = container;
    const mediaParams: string[] = [];
    const supportsParams: string[] = [];

    while (isChildNode(currentContainer)) {
      if (!isAtRuleNode(currentContainer)) {
        // do not convert if parent is not at-rule
        return '';
      }

      if (currentContainer.name === 'media') {
        mediaParams.push(currentContainer.params);
      } else if (currentContainer.name === 'supports') {
        supportsParams.push(currentContainer.params);
      } else {
        return '';
      }

      currentContainer = currentContainer.parent;
    }

    let mediaPrefixes = '',
      supportsPrefixes = '';
    if (mediaParams.length) {
      mediaPrefixes = this.convertMediaParamsToClassPrefix(
        mediaParams.reverse()
      );
      if (!mediaPrefixes) {
        return;
      }
    }

    if (supportsParams.length) {
      supportsPrefixes = this.convertSupportsParamsToClassPrefix(
        supportsParams.reverse()
      );
      if (!supportsPrefixes) {
        return;
      }
    }

    return mediaPrefixes + supportsPrefixes;
  }

  protected convertMediaParamsToClassPrefix(mediaParams: string[]) {
    const modifiers: string[] = [];
    const screens: string[] = [];

    for (let i = 0; i < mediaParams.length; i++) {
      const splitted = mediaParams[i].split(' and ');
      for (let j = 0; j < splitted.length; j++) {
        const param = normalizeAtRuleParams(splitted[j].trim());

        if (param === 'screen') {
          continue;
        }

        if (param.includes('width') || param.includes('height')) {
          screens.push(param);
          continue;
        }

        let mapped = (MEDIA_PARAMS_MAPPING as any)[param.replace(/\s+/g, '')];
        if (mapped) {
          modifiers.push(mapped);
          continue;
        }

        // do not convert if not convertable media
        return '';
      }
    }

    const mappedScreen = this.config.mapping.screens[screens.join(' and ')];

    if (!mappedScreen) {
      return '';
    }

    modifiers.push(mappedScreen);

    const classPrefix = modifiers.join(':');

    return classPrefix ? classPrefix + ':' : '';
  }

  protected convertSupportsParamsToClassPrefix(supportParams: string[]) {
    const buildParams = supportParams.join(' and ');
    const classPrefix = convertDeclarationValue(
      supportParams.length > 1
        ? removeUnnecessarySpaces(buildParams)
        : normalizeAtRuleParams(buildParams),
      this.config.mapping.supports || {},
      'supports'
    );

    return classPrefix ? classPrefix + ':' : '';
  }
}
