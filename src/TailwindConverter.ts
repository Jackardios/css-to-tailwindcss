import type { AttributeSelector, Selector } from 'css-what';
import type { Config } from 'tailwindcss';
import type { ConverterMapping } from './types/ConverterMapping';

import postcss, {
  AcceptedPlugin,
  AtRule,
  Container,
  Declaration,
  Rule,
  Root,
  Document,
} from 'postcss';
import postcssSafeParser from 'postcss-safe-parser';
import { parse, stringify, isTraversal } from 'css-what';

import { TailwindNode, TailwindNodesManager } from './TailwindNodesManager';
import { isAtRuleNode } from './utils/isAtRuleNode';
import {
  converterMappingByTailwindTheme,
  normalizeAtRuleParams,
} from './utils/converterMappingByTailwindTheme';
import {
  convertDeclarationValue,
  prepareArbitraryValue,
  TAILWIND_DECLARATION_CONVERTERS,
} from './constants/converters';
import { isChildNode } from './utils/isChildNode';
import { MEDIA_PARAMS_MAPPING } from './constants/media-params-mapping';
import { removeUnnecessarySpaces } from './utils/removeUnnecessarySpaces';
import { reduceTailwindClasses } from './utils/reduceTailwindClasses';
import { PSEUDOS_MAPPING } from './constants/pseudos-mapping';
import { detectIndent } from './utils/detectIndent';
import { resolveConfig, ResolvedTailwindConfig } from './utils/resolveConfig';

export interface TailwindConverterConfig {
  remInPx?: number | null;
  tailwindConfig?: Config;
  postCSSPlugins: AcceptedPlugin[];
  arbitraryPropertiesIsEnabled: boolean;
}

export interface ResolvedTailwindConverterConfig
  extends TailwindConverterConfig {
  tailwindConfig: ResolvedTailwindConfig;
  mapping: ConverterMapping;
}

export const DEFAULT_CONVERTER_CONFIG: Omit<
  TailwindConverterConfig,
  'tailwindConfig'
> = {
  postCSSPlugins: [],
  arbitraryPropertiesIsEnabled: false,
};

export class TailwindConverter {
  protected config: ResolvedTailwindConverterConfig;

  constructor({
    tailwindConfig,
    ...converterConfig
  }: Partial<TailwindConverterConfig> = {}) {
    const resolvedTailwindConfig = resolveConfig(
      tailwindConfig || ({ content: [] } as Config)
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

    this.cleanRaws(parsed.root);

    return {
      nodes,
      convertedRoot: parsed.root,
    };
  }

  protected cleanRaws(root: Root | Document) {
    root.raws.indent = detectIndent(root);

    root.walkRules(node => {
      if (node.nodes?.length === 0) {
        node.remove();
      } else {
        node.cleanRaws(true);
      }
    });

    root.walkAtRules(node => {
      if (node.nodes?.length === 0) {
        node.remove();
      } else {
        node.cleanRaws(true);
      }
    });
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
      tailwindClasses = reduceTailwindClasses(tailwindClasses);

      if (this.config.tailwindConfig.prefix) {
        tailwindClasses = tailwindClasses.map(className =>
          className[0] === '[' // is "arbitrary property" class
            ? className
            : `${this.config.tailwindConfig.prefix}${className}`
        );
      }

      return this.makeTailwindNode(rule, tailwindClasses);
    }

    return null;
  }

  protected convertDeclarationToClasses(declaration: Declaration) {
    let classes =
      TAILWIND_DECLARATION_CONVERTERS[declaration.prop]?.(
        declaration,
        this.config
      ) || [];

    if (classes.length === 0 && this.config.arbitraryPropertiesIsEnabled) {
      return [
        `[${declaration.prop}:${prepareArbitraryValue(declaration.value)}]`,
      ];
    }

    return classes;
  }

  protected makeTailwindNode(
    rule: Rule,
    tailwindClasses: string[]
  ): TailwindNode {
    let { baseSelector, classPrefix } = this.parseSelector(rule.selector);

    const containerClassPrefix = this.convertContainerToClassPrefix(
      rule.parent
    );

    if (containerClassPrefix) {
      return {
        key: baseSelector,
        fallbackRule: rule,
        classesPrefixWhenFound: containerClassPrefix + classPrefix,
        tailwindClasses,
      };
    }

    if (classPrefix) {
      return {
        key: TailwindNodesManager.convertRuleToKey(rule, baseSelector),
        fallbackRule: rule,
        classesPrefixWhenFound: classPrefix,
        tailwindClasses,
      };
    }

    return { rule, tailwindClasses };
  }

  protected parseSelector(rawSelector: string) {
    const parsedSelectors = parse(rawSelector);

    if (parsedSelectors.length !== 1) {
      return { baseSelector: rawSelector, classPrefix: '' };
    }

    const parsedSelector = parsedSelectors[0];
    let baseSelectors: Array<Selector> = [];
    let classPrefixes: Array<string> = [];
    parsedSelector?.forEach((selectorItem, index) => {
      if (isTraversal(selectorItem)) {
        baseSelectors = parsedSelector.slice(0, index + 1);
        classPrefixes = [];

        return;
      }

      const classPrefix = this.convertSelectorToClassPrefix(selectorItem);

      if (classPrefix) {
        classPrefixes.push(classPrefix);
      } else {
        baseSelectors.push(selectorItem);
      }
    });

    return {
      baseSelector: stringify([baseSelectors]),
      classPrefix: classPrefixes.join(''),
    };
  }

  protected convertSelectorToClassPrefix(selector: Selector) {
    if (selector.type === 'pseudo' || selector.type === 'pseudo-element') {
      const mapped = (PSEUDOS_MAPPING as any)[selector.name];

      return mapped ? `${mapped}${this.config.tailwindConfig.separator}` : null;
    }

    if (selector.type === 'attribute') {
      if (selector.name.startsWith('aria-')) {
        const mappingKey = this.attributeSelectorToMappingKey(selector, 6);
        const mapped = this.config.mapping.aria?.[mappingKey];

        if (!mapped) {
          return null;
        }

        return `${mapped}${this.config.tailwindConfig.separator}`;
      }

      if (selector.name.startsWith('data-')) {
        const mappingKey = this.attributeSelectorToMappingKey(selector, 6);
        const mapped = this.config.mapping.data?.[mappingKey];

        if (!mapped) {
          return null;
        }

        return `${mapped}${this.config.tailwindConfig.separator}`;
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
        return '';
      }
    }

    if (supportsParams.length) {
      supportsPrefixes = this.convertSupportsParamsToClassPrefix(
        supportsParams.reverse()
      );
      if (!supportsPrefixes) {
        return '';
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

    if (screens.length > 0) {
      const mappedScreen = this.config.mapping.screens[screens.join(' and ')];

      if (!mappedScreen) {
        return '';
      }

      modifiers.push(mappedScreen);
    }

    const classPrefix = modifiers.join(this.config.tailwindConfig.separator);

    return classPrefix
      ? classPrefix + this.config.tailwindConfig.separator
      : '';
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

    return classPrefix
      ? classPrefix + this.config.tailwindConfig.separator
      : '';
  }
}
