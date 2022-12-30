import type {
  AttributeSelector,
  PseudoElement,
  PseudoSelector,
  TagSelector,
} from 'css-what';
import { AtRule, Declaration, Rule } from 'postcss';
import type { Config } from 'tailwindcss';

import postCSSParser from 'postcss-safe-parser';
import resolveConfig from 'tailwindcss/resolveConfig';
import { snakeCase } from 'change-case';
import { parse, stringify } from 'css-what';

import { MergeableNode, TailwindNodesManager } from './TailwindNodesManager';
import { isAtRuleNode } from './utils/isAtRuleNode';
import { isAriaSelector } from './utils/isAriaSelector';
import { prepareRuleSelectors } from './utils/prepareRuleSelectors';

export class TailwindConverter {
  protected resolvedTailwindConfig: Config;

  constructor(tailwindConfig: Config = { content: [] }) {
    this.resolvedTailwindConfig = resolveConfig(tailwindConfig);
  }

  convertCSS(css: string) {
    const nodesManager = new TailwindNodesManager();
    const ast = postCSSParser(css);

    ast.walkRules(rule => {
      nodesManager.mergeNodes(this.convertRule(rule));
    });

    return nodesManager.getNodes();
  }

  convertRule(rule: Rule) {
    const nodesManager = new TailwindNodesManager();

    prepareRuleSelectors(rule).forEach(selector => {
      let tailwindClasses: string[] = [];

      rule.walkDecls(declaration => {
        tailwindClasses = tailwindClasses.concat(
          this.convertDeclarationToClasses(declaration)
        );
      });

      if (tailwindClasses.length) {
        nodesManager?.mergeNode(
          this.makeTailwindNode(
            tailwindClasses,
            rule,
            selector || rule.selector
          )
        );
      }
    });

    return nodesManager.getNodes();
  }

  convertDeclarationToClasses(declaration: Declaration) {
    return [`${declaration.prop}-[${snakeCase(declaration.value)}]`]; // as fallback
  }

  protected makeTailwindNode(
    tailwindClasses: string[],
    rule: Rule,
    selector: string
  ): MergeableNode {
    const parsedSelector = parse(selector)[0];
    const base: Array<TagSelector | AttributeSelector> = [];
    const convertable: Array<
      AttributeSelector | PseudoSelector | PseudoElement
    > = [];

    parsedSelector?.forEach(item => {
      if (
        ['pseudo', 'pseudo-element'].includes(item.type) ||
        isAriaSelector(item)
      ) {
        convertable.push(
          item as AttributeSelector | PseudoSelector | PseudoElement
        );
      } else if (['tag', 'attribute'].includes(item.type)) {
        base.push(item as TagSelector | AttributeSelector);
      }
    });

    const isComplexSelector =
      base.length + convertable.length !== parsedSelector.length;

    if (!isComplexSelector) {
      const classesPrefix = convertable.map(item => `${item.name}:`).join('');

      selector = stringify([base]);
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
    };
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
    if (atRule.name === 'media') {
      return 'media:';
    }

    return '';
  }
}
