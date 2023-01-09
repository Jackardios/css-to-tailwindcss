import type { Selector } from 'css-what';
import type { AcceptedPlugin, AtRule, Declaration, Rule } from 'postcss';
import type { Config } from 'tailwindcss';
import type { ConverterMapping } from './types/ConverterMapping';

import postcss from 'postcss';
import postcssSafeParser from 'postcss-safe-parser';
import resolveConfig from 'tailwindcss/resolveConfig';
import { parse, stringify } from 'css-what';

import { TailwindNode, TailwindNodesManager } from './TailwindNodesManager';
import { isAtRuleNode } from './utils/isAtRuleNode';
import { converterMappingByTailwindTheme } from './utils/converterMappingByTailwindTheme';
import { TAILWIND_DECLARATION_CONVERTERS } from './constants/converters';

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

  convertCSS(css: string) {
    const nodesManager = new TailwindNodesManager();

    postcss(this.config.postCSSPlugins)
      .process(css, { parser: postcssSafeParser })
      .then(result => {
        result.root.walkRules(rule => {
          nodesManager.mergeNodes(this.convertRule(rule));
        });
      });

    return nodesManager.getNodes();
  }

  convertRule(rule: Rule) {
    const nodesManager = new TailwindNodesManager();

    rule.selectors.forEach(selector => {
      let tailwindClasses: string[] = [];
      let skippedDeclarations: Declaration[] = [];

      rule.walkDecls(declaration => {
        const converted = this.convertDeclarationToClasses(declaration);
        if (converted?.length) {
          tailwindClasses = tailwindClasses.concat();
        } else {
          skippedDeclarations.push(declaration);
        }
      });

      if (tailwindClasses.length) {
        nodesManager?.mergeNode(
          this.makeTailwindNode(
            tailwindClasses,
            rule,
            selector || rule.selector,
            skippedDeclarations
          )
        );
      }
    });

    return nodesManager.getNodes();
  }

  convertDeclarationToClasses(declaration: Declaration) {
    return (
      TAILWIND_DECLARATION_CONVERTERS[declaration.prop]?.(
        declaration,
        this.config
      ) || []
    );
  }

  protected makeTailwindNode(
    tailwindClasses: string[],
    rule: Rule,
    selector: string,
    skippedDeclarations: Declaration[] = []
  ): TailwindNode {
    const parsedSelector = parse(selector)[0];
    const baseSelectors: Array<Selector> = [];
    const converted: Array<string> = [];

    parsedSelector?.forEach(item => {
      const convertedSelector = this.convertSelector(item);

      if (convertedSelector) {
        converted.push(convertedSelector);
      } else if (item.type === 'tag' || item.type === 'attribute') {
        baseSelectors.push(item);
      }
    });

    const isComplexSelector =
      baseSelectors.length + converted.length !== parsedSelector.length;

    if (!isComplexSelector) {
      const classesPrefix = converted.join('');

      selector = stringify([baseSelectors]);
      tailwindClasses = tailwindClasses.map(
        className => `${classesPrefix}${className}`
      );
    }

    if (isAtRuleNode(rule.parent)) {
      tailwindClasses = this.prepareClassesByAtRule(
        tailwindClasses,
        rule.parent
      );
    }

    return {
      selector,
      tailwindClasses,
      skippedDeclarations,
    };
  }

  protected convertSelector(selector: Selector) {
    if (selector.type === 'pseudo' || selector.type === 'pseudo-element') {
      return `${selector.name}:`;
    }

    if (selector.type === 'attribute') {
      if (selector.name.startsWith('aria-')) {
        const mapped =
          this.config.mapping.aria[stringify([[selector]]).substring(5)];

        if (!mapped) {
          return null;
        }

        return `${mapped}:`;
      }

      if (selector.name.startsWith('data-')) {
        const mapped =
          this.config.mapping.data[stringify([[selector]]).substring(5)];

        if (!mapped) {
          return null;
        }

        return `${mapped}:`;
      }
    }

    return null;
  }

  protected prepareClassesByAtRule(
    tailwindClasses: string[],
    atRule: AtRule
  ): string[] {
    const prefix = this.convertAtRuleToClassPrefix(atRule);
    tailwindClasses = prefix
      ? tailwindClasses.map(className => `${prefix}${className}`)
      : tailwindClasses;

    return isAtRuleNode(atRule.parent)
      ? this.prepareClassesByAtRule(tailwindClasses, atRule.parent)
      : tailwindClasses;
  }

  protected convertAtRuleToClassPrefix(atRule: AtRule) {
    // TODO: add implementation
    if (atRule.name === 'media') {
      return 'media:';
    }

    return '';
  }
}
