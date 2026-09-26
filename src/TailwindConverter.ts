import type { AttributeSelector, Selector } from 'css-what';
import type { Config } from 'tailwindcss';
import type { ConverterMapping } from './types/ConverterMapping';

import postcss, {
  AcceptedPlugin,
  AtRule,
  ChildNode,
  Container,
  Declaration,
  Rule,
  Root,
  Document,
} from 'postcss';
import postcssSafeParser from 'postcss-safe-parser';
import { stringify, isTraversal } from 'css-what';

import {
  ResolvedTailwindNode,
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
  prepareArbitraryValue,
  DECLARATION_CONVERTERS_MAPPING,
  DECLARATION_UTILITIES_CONVERTERS_MAPPING,
} from './mappings/declaration-converters-mapping';
import { MEDIA_PARAMS_MAPPING } from './mappings/media-params-mapping';
import {
  DESCENDANT_VARIANTS,
  PSEUDOS_MAPPING,
  PSEUDO_ELEMENT_VARIANTS,
  SELECTOR_VARIANTS_ORDER,
} from './mappings/pseudos-mapping';
import { detectIndent } from './utils/detectIndent';
import { getOwn } from './core/getOwn';
import { resolveConfig, ResolvedTailwindConfig } from './utils/resolveConfig';
import { hasRuleAncestor, isConvertibleContext } from './core/context';
import {
  definiteLonghandsOf,
  longhandsOf,
  propertiesIntersect,
} from './core/longhands';
import {
  ConvertedDeclaration,
  ConvertedUtility,
  formatUtilityClass,
  UtilitiesPlacement,
  Variant,
} from './core/placement';
import {
  normalizeSelectorKey,
  rawSelectorPrefix,
  safeParseSelector,
  selectorClassNames,
  stringifySelector,
} from './core/selector';
import { escapeArbitraryValue, isBalancedValue } from './core/values';

export interface TailwindConverterConfig {
  /** The size of `1rem` in px to match `rem` values with the theme, `null` disables the matching. */
  remInPx?: number | null;
  /** Tailwind config whose theme, prefix, separator and core plugins the classes follow. */
  tailwindConfig?: Config;
  /** PostCSS plugins applied to the input before the conversion, e.g. `postcss-nested`. */
  postCSSPlugins: AcceptedPlugin[];
  /** Convert declarations without a matching utility to arbitrary properties, e.g. `[mask-type:luminance]`. */
  arbitraryPropertiesIsEnabled: boolean;
  /**
   * Convert `@media`/`@supports` that don't match the theme to arbitrary variants,
   * e.g. `[@media_(max-width:_767px)]:`, instead of leaving them as CSS.
   */
  arbitraryVariants?: boolean;
  /**
   * Don't use utilities that set more than the source declaration
   * (e.g. theme font sizes that also set line-height), use exact arbitrary values or leave CSS instead.
   */
  strict?: boolean;
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
  arbitraryVariants: false,
  strict: false,
};

/**
 * Tailwind reads `/` in a class as a modifier and can't parse braces in arbitrary variants,
 * even escaped ones.
 */
const UNSAFE_ARBITRARY_VARIANT_REGEXP = /[/{}]/;

/** Pseudo-elements that may be written with a single colon. */
const LEGACY_PSEUDO_ELEMENTS = [
  'before',
  'after',
  'first-line',
  'first-letter',
];

/** Tailwind can't parse classes with empty or unbalanced values. */
function isConvertibleValue(value: string) {
  return value.trim() !== '' && isBalancedValue(value);
}

function isPseudoElement(selector: Selector) {
  return (
    selector.type === 'pseudo-element' ||
    (selector.type === 'pseudo' &&
      LEGACY_PSEUDO_ELEMENTS.includes(selector.name.toLowerCase()))
  );
}

/** The longhands set by a rule, or `null` if it contains anything but declarations and comments. */
function declaredProperties(rule: Rule) {
  const properties = new Set<string>();

  for (const child of rule.nodes) {
    if (child.type === 'decl') {
      longhandsOf(child.prop).forEach(property => properties.add(property));
    } else if (child.type !== 'comment') {
      return null;
    }
  }

  return properties;
}

interface PlannedDeclaration {
  declaration: Declaration;
  converted: ConvertedDeclaration;
}

interface RuleLocation {
  anchor: ChildNode;
  baseSelector: string;
  variants: Variant[];
  mergeable: boolean;
}

export class TailwindConverter {
  protected config: ResolvedTailwindConverterConfig;
  /** Class names used in the selectors of the file being converted. */
  private fileClassNames = new Set<string>();

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

  async convertCSS(css: string): Promise<{
    nodes: ResolvedTailwindNode[];
    convertedRoot: Document | Root;
  }> {
    const parsed = await postcss(this.config.postCSSPlugins).process(css, {
      parser: postcssSafeParser,
      from: undefined,
      // don't load previous source maps referenced by the input
      map: false,
    });

    // IE hacks (`*zoom: 1`) are parsed with the hack in `raws.before`, which `cleanRaws` drops,
    // so the hack is moved to the property, which isn't converted then
    parsed.root.walkDecls(declaration => {
      const hack = declaration.raws.before?.slice(-1);

      if (hack === '*' || hack === '_') {
        declaration.raws.before = declaration.raws.before?.slice(0, -1);
        declaration.prop = hack + declaration.prop;
      }
    });

    // the nodes `detectIndent` looks at, collected before empty rules are removed
    const indentNodes: ChildNode[] = [];
    parsed.root.each(child => {
      if ('nodes' in child && child.nodes) {
        indentNodes.push(...child.nodes);
      }
    });

    // Rules are collected beforehand, since placing utilities inserts new rules into the tree
    const rules: Rule[] = [];
    // the longhands of the rules consisting of declarations only (`null` for other rules),
    // cached so that merging a run of rules takes linear time
    const properties = new Map<Rule, Set<string> | null>();
    const propertiesOf = (rule: Rule) => {
      if (!properties.has(rule)) {
        properties.set(rule, declaredProperties(rule));
      }

      return properties.get(rule) as Set<string> | null;
    };
    parsed.root.walkRules((rule, index) => {
      const prev = rule.parent?.nodes[index - 1];

      if (
        prev?.type === 'rule' &&
        this.canMergeAdjacentRules(prev, rule, propertiesOf)
      ) {
        propertiesOf(rule)?.forEach(property =>
          propertiesOf(prev)?.add(property)
        );
        prev.append(rule.nodes);
        rule.remove();
      } else {
        rules.push(rule);
      }
    });

    // the conversion below is synchronous, so concurrent calls don't share the class names
    this.fileClassNames = new Set();
    rules.forEach(rule => {
      selectorClassNames(rule.selector).forEach(className =>
        this.fileClassNames.add(className)
      );
    });

    let nodes: ResolvedTailwindNode[];

    if (
      this.isOverridden('convertRule') ||
      this.isOverridden('makeTailwindNode')
    ) {
      nodes = this.convertRulesWithNodesManager(rules);
    } else {
      const placement = new UtilitiesPlacement();
      rules.forEach(rule => this.convertRuleInPlacement(rule, placement));

      nodes = placement.getNodes(
        {
          prefix: this.config.tailwindConfig.prefix,
          separator: this.config.tailwindConfig.separator,
        },
        (className, variants, important, rule) =>
          this.isClassApplicable(
            className,
            variants,
            important,
            selectorClassNames(rule.selector)
          )
      );
    }

    nodes.forEach(node => {
      if (node.tailwindClasses.length) {
        node.rule.prepend(
          new AtRule({
            name: 'apply',
            params: node.tailwindClasses.join(' '),
          })
        );
      }
    });

    // Match the indent detection of 1.0: it ran after the converted declarations were removed,
    // but before the empty rules were
    const indentNode = indentNodes.find(
      node => (node.parent || node.type === 'rule') && node.raws.before != null
    );
    if (indentNode && !parsed.root.raws.indent) {
      parsed.root.raws.indent = (
        indentNode.raws.before?.split('\n').pop() || ''
      ).replace(/\S/g, '');
    }

    this.cleanRaws(parsed.root);

    return {
      nodes: nodes.filter(node => node.tailwindClasses.length),
      convertedRoot: parsed.root,
    };
  }

  /**
   * Adjacent rules with the same selector and without variants are merged, so that the side effects
   * of utilities (e.g. `line-height` of `text-sm`) are resolved as in a single rule. Rules setting
   * the same properties are not merged: the declarations would become fallbacks of each other.
   */
  private canMergeAdjacentRules(
    prev: Rule,
    rule: Rule,
    propertiesOf: (rule: Rule) => Set<string> | null
  ) {
    if (
      normalizeSelectorKey(prev.selector) !==
        normalizeSelectorKey(rule.selector) ||
      !isConvertibleContext(rule) ||
      this.resolveRuleLocation(rule).variants.length
    ) {
      return false;
    }

    const prevProperties = propertiesOf(prev);
    const ruleProperties = propertiesOf(rule);

    return (
      !!prevProperties &&
      !!ruleProperties &&
      !propertiesIntersect(ruleProperties, prevProperties)
    );
  }

  /**
   * The conversion of 1.0, used when a subclass overrides `convertRule` or `makeTailwindNode`.
   */
  private convertRulesWithNodesManager(rules: Rule[]) {
    const nodesManager = new TailwindNodesManager();

    rules.forEach(rule => {
      if (!isConvertibleContext(rule)) {
        return;
      }

      const converted = this.convertRule(rule);
      if (converted) {
        nodesManager.mergeNode(converted);
      }
    });

    return nodesManager.getNodes();
  }

  /**
   * Checks whether a subclass overrides a method of the 1.0 API. The conversion calls an overridden
   * method instead of its replacement, so that the customizations made for 1.0 keep working.
   */
  private isOverridden(method: string) {
    return (
      (this as unknown as Record<string, unknown>)[method] !==
      (TailwindConverter.prototype as unknown as Record<string, unknown>)[
        method
      ]
    );
  }

  /**
   * Converts a class prefix returned by a 1.0 method (e.g. `md:hover:`) to a variant.
   */
  private classPrefixToVariant(classPrefix: string | null | undefined) {
    if (!classPrefix) {
      return null;
    }

    const { separator = ':' } = this.config.tailwindConfig;

    return classPrefix.endsWith(separator)
      ? classPrefix.slice(0, -separator.length)
      : classPrefix;
  }

  private convertRuleInPlacement(rule: Rule, placement: UtilitiesPlacement) {
    if (!isConvertibleContext(rule)) {
      return;
    }

    const location = this.resolveRuleLocation(rule);
    const plan = (variants: Variant[]) =>
      this.convertRuleDeclarations(
        rule,
        this.createApplyConflictGuard(rule, variants)
      );
    let planned = plan(location.variants);

    if (!planned.length) {
      return;
    }

    const isPlaced = placement.place({
      rule,
      declarations: planned.map(item => item.converted),
      ...location,
      allowCreate: location.baseSelector.trim() !== '',
    });

    if (!isPlaced) {
      // The utilities can't be moved to a base rule (see `UtilitiesPlacement.place`), so the rule
      // keeps them. Without variants other classes of the file may conflict, so the rule is planned again.
      planned = plan([]);

      placement.place({
        rule,
        declarations: planned.map(item => item.converted),
        anchor: rule,
        baseSelector: rule.selector,
        variants: [],
        mergeable: false,
        allowCreate: false,
      });
    }

    planned.forEach(({ declaration }) => declaration.remove());
    placement.invalidateEffectiveProps(rule);

    // Empty rules are removed in the end anyway, removing them now saves the placement
    // from looking through them again
    if (!rule.nodes.length && !placement.hasUtilities(rule)) {
      rule.remove();
    }
  }

  /**
   * Returns a check for utilities that can't be used with `@apply` in the rule:
   * - Tailwind throws on `@apply` of a class inside a rule whose selector contains the same class
   *   (e.g. `.float-left { @apply float-left }`);
   * - `@apply` of a class also applies the rules of the same file that use this class
   *   (e.g. `@apply float-left` copies the declarations of `.foo .float-left { … }`).
   */
  private createApplyConflictGuard(rule: Rule, variants: Variant[]) {
    const ruleClassNames = selectorClassNames(rule.selector);
    const variantValues = variants.map(variant => variant.value);

    return (utility: ConvertedUtility, important: boolean) =>
      this.isClassApplicable(
        utility.className,
        variantValues,
        important,
        ruleClassNames
      );
  }

  private isClassApplicable(
    className: string,
    variants: string[],
    important: boolean,
    ruleClassNames: Set<string>
  ) {
    const formatOptions = {
      prefix: this.config.tailwindConfig.prefix,
      separator: this.config.tailwindConfig.separator,
    };
    // `@apply !float-left` looks up both `float-left` and `!float-left`
    const importantModifiers = important ? [false, true] : [false];

    return !importantModifiers.some(isImportant => {
      const candidate = formatUtilityClass(
        className,
        variants,
        isImportant,
        formatOptions
      );
      const baseCandidate = formatUtilityClass(
        className,
        [],
        isImportant,
        formatOptions
      );

      return (
        this.fileClassNames.has(candidate) ||
        ruleClassNames.has(candidate) ||
        ruleClassNames.has(baseCandidate)
      );
    });
  }

  /**
   * Converts the rule's own declarations, the caller removes the converted ones.
   * A declaration is left as is if converting it could change which declaration wins:
   * `@apply` is inserted before the remaining declarations of the rule.
   */
  private convertRuleDeclarations(
    rule: Rule,
    isUtilityAllowed: (
      utility: ConvertedUtility,
      important: boolean
    ) => boolean = () => true
  ): PlannedDeclaration[] {
    const declarations: Declaration[] = [];
    // at-rules of the rule (e.g. an existing `@apply`) stay after the inserted `@apply`
    let declarationsBeforeAtRule = Infinity;

    rule.each(node => {
      if (node.type === 'decl') {
        declarations.push(node);
      } else if (node.type === 'atrule') {
        declarationsBeforeAtRule = Math.min(
          declarationsBeforeAtRule,
          declarations.length
        );
      }
    });

    const valuesByProperty = new Map<string, Set<string>>();
    declarations.forEach(declaration => {
      const property = declaration.prop.toLowerCase();
      const values = valuesByProperty.get(property) || new Set<string>();
      values.add(`${declaration.value.trim()}${declaration.important}`);
      valuesByProperty.set(property, values);
    });

    const declarationsProps = declarations.map(declaration =>
      longhandsOf(declaration.prop)
    );
    const candidates = declarations.map(declaration =>
      // the same property with different values is usually a fallback for older browsers
      (valuesByProperty.get(declaration.prop.toLowerCase())?.size || 0) > 1
        ? []
        : this.safeConvertDeclarationToUtilities(declaration)
    );

    /**
     * A utility may set more than its declaration (e.g. `border-solid` for `border-top: 1px solid`
     * sets the style of all sides). Other declarations of the rule setting these properties must be
     * converted to the same utility, and with `strict` or `!important` they must set all of them.
     */
    const hasAllowedSideEffects = (index: number) =>
      candidates[index].every(utility => {
        const sideEffectProps = utility.props.filter(
          p => !declarationsProps[index].includes(p)
        );

        if (!sideEffectProps.length) {
          return true;
        }

        const others = declarations
          .map((_, otherIndex) => otherIndex)
          .filter(
            otherIndex =>
              otherIndex !== index &&
              propertiesIntersect(
                declarationsProps[otherIndex],
                sideEffectProps
              )
          );

        return (
          others.every(otherIndex =>
            candidates[otherIndex].some(
              other => other.className === utility.className
            )
          ) &&
          (!(this.config.strict || declarations[index].important) ||
            sideEffectProps.every(p =>
              others.some(otherIndex =>
                declarationsProps[otherIndex].includes(p)
              )
            ))
        );
      });

    const orderSensitiveProps = new Set<string>();
    const planned: PlannedDeclaration[] = [];

    declarations.forEach((declaration, index) => {
      const declarationProps = declarationsProps[index];
      let utilities = candidates[index];

      if (
        index >= declarationsBeforeAtRule ||
        propertiesIntersect(declarationProps, orderSensitiveProps) ||
        !utilities.every(utility =>
          isUtilityAllowed(utility, !!declaration.important)
        ) ||
        (utilities.some(utility => utility.partial) &&
          declarationsProps
            .slice(index + 1)
            .some(laterProps =>
              propertiesIntersect(laterProps, declarationProps)
            )) ||
        !hasAllowedSideEffects(index)
      ) {
        utilities = [];
      }

      const isArbitraryProperty = utilities.some(
        utility => utility.className[0] === '['
      );

      if (!utilities.length || isArbitraryProperty) {
        // Unconverted declarations stay after `@apply`, and arbitrary properties are placed
        // after all other utilities by Tailwind, so the following overlapping declarations can't be converted
        declarationProps.forEach(p => orderSensitiveProps.add(p));
      }

      if (!utilities.length) {
        return;
      }

      planned.push({
        declaration,
        converted: {
          declarationProps,
          overriddenProps: definiteLonghandsOf(declaration.prop),
          important: !!declaration.important,
          utilities,
        },
      });
    });

    return planned;
  }

  /**
   * Leaves the declaration as is if its value is so deeply nested that the value parser overflows the stack.
   */
  private safeConvertDeclarationToUtilities(declaration: Declaration) {
    try {
      return this.convertDeclarationToUtilities(declaration);
    } catch (error) {
      if (error instanceof RangeError) {
        return [];
      }

      throw error;
    }
  }

  private convertDeclarationToUtilities(
    declaration: Declaration
  ): ConvertedUtility[] {
    if (!isConvertibleValue(declaration.value)) {
      return [];
    }

    const props = longhandsOf(declaration.prop);
    const config = this.configFor(declaration);
    const utilitiesConverter = getOwn(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING,
      declaration.prop
    );
    let utilities: ConvertedUtility[];

    if (utilitiesConverter) {
      utilities = utilitiesConverter(declaration, config);

      if (!utilities.length && this.canMakeArbitraryProperty(declaration)) {
        utilities = [
          { className: this.makeArbitraryProperty(declaration), props },
        ];
      }
    } else {
      utilities = this.convertDeclarationToClassesWithConfig(
        declaration,
        config
      ).map(className => ({ className, props }));
    }

    if (!this.isOverridden('convertDeclarationToClasses')) {
      return utilities;
    }

    // the classes of the override that the conversion above also returns keep their properties
    // (e.g. `text-sm` sets `line-height` too), the other ones stand for the declaration
    return this.convertDeclarationToClasses(declaration).map(
      className =>
        utilities.find(utility => utility.className === className) || {
          className,
          props,
        }
    );
  }

  protected convertDeclarationToClasses(declaration: Declaration) {
    if (!isConvertibleValue(declaration.value)) {
      return [];
    }

    return this.convertDeclarationToClassesWithConfig(
      declaration,
      this.configFor(declaration)
    );
  }

  /**
   * Important utilities override the other declarations of the rule with their side effects
   * (e.g. `!text-sm` overrides `line-height`), so only the exact ones are used for them.
   */
  private configFor(declaration: Declaration): ResolvedTailwindConverterConfig {
    return declaration.important && !this.config.strict
      ? { ...this.config, strict: true }
      : this.config;
  }

  private convertDeclarationToClassesWithConfig(
    declaration: Declaration,
    config: ResolvedTailwindConverterConfig
  ) {
    const classes =
      getOwn(DECLARATION_CONVERTERS_MAPPING, declaration.prop)?.(
        declaration,
        config
      ) || [];

    if (classes.length === 0 && this.canMakeArbitraryProperty(declaration)) {
      return [this.makeArbitraryProperty(declaration)];
    }

    return classes;
  }

  private canMakeArbitraryProperty(declaration: Declaration) {
    // not for IE hacks
    return (
      this.config.arbitraryPropertiesIsEnabled &&
      !/^[*_]/.test(declaration.prop)
    );
  }

  private makeArbitraryProperty(declaration: Declaration) {
    // Tailwind doesn't recognize uppercase property names, the names of custom properties are case-sensitive
    const property = declaration.prop.startsWith('--')
      ? declaration.prop
      : declaration.prop.toLowerCase();

    return `[${property}:${prepareArbitraryValue(declaration.value)}]`;
  }

  /**
   * Finds out where the rule's utilities should go: variants are extracted from the selector
   * (`:hover`, `[aria-*]`, …) and from the at-rules around the rule (`@media`, `@supports`),
   * and the utilities are moved to a rule with the remaining base selector.
   */
  private resolveRuleLocation(rule: Rule): RuleLocation {
    // rules without variants are converted in place
    const inPlace: RuleLocation = {
      anchor: rule,
      baseSelector: rule.selector,
      variants: [],
      mergeable: false,
    };

    if (hasRuleAncestor(rule)) {
      // nesting that wasn't flattened by a plugin
      return inPlace;
    }

    const selector = this.isOverridden('parseSelector')
      ? this.parseSelectorWithClassPrefix(rule.selector)
      : this.parseSelectorVariants(rule.selector);
    const context = this.resolveContextVariants(rule);

    const variants = [
      ...(context?.variants || []),
      ...(selector?.variants || []),
    ];

    if (!variants.length) {
      return inPlace;
    }

    return {
      anchor: context?.anchor || rule,
      baseSelector: selector?.baseSelector ?? rule.selector,
      variants,
      mergeable: true,
    };
  }

  private parseSelectorWithClassPrefix(rawSelector: string) {
    const { baseSelector, classPrefix } = this.parseSelector(rawSelector);
    const variant = this.classPrefixToVariant(classPrefix);

    return {
      baseSelector,
      variants: variant ? [this.makeSelectorVariant(variant)] : [],
    };
  }

  /**
   * Extracts variants from the last compound selector, e.g. `.foo .bar:hover` → `.foo .bar` + `hover`.
   * Returns `null` if the selector can't be split safely.
   */
  private parseSelectorVariants(
    rawSelector: string
  ): { baseSelector: string; variants: Variant[] } | null {
    const parsedSelectors = safeParseSelector(rawSelector);

    if (!parsedSelectors || parsedSelectors.length !== 1) {
      return null;
    }

    const [parsedSelector] = parsedSelectors;
    let baseSelectors: Selector[] = [];
    let variants: Variant[] = [];
    let compoundHasBase = false;
    let compoundHasUnmappedPseudoElement = false;
    let compoundHasPseudoElement = false;
    let isVariantAfterPseudoElement = false;

    parsedSelector.forEach((selectorItem, index) => {
      if (isTraversal(selectorItem)) {
        baseSelectors = parsedSelector.slice(0, index + 1);
        variants = [];
        compoundHasBase = false;
        compoundHasUnmappedPseudoElement = false;
        compoundHasPseudoElement = false;
        isVariantAfterPseudoElement = false;

        return;
      }

      const variant = this.isOverridden('convertSelectorToClassPrefix')
        ? this.classPrefixToVariant(
            this.convertSelectorToClassPrefix(selectorItem)
          )
        : this.convertSelectorToVariant(selectorItem);

      if (variant) {
        if (compoundHasPseudoElement) {
          isVariantAfterPseudoElement = true;
        }
        variants.push(this.makeSelectorVariant(variant));
      } else {
        baseSelectors.push(selectorItem);
        compoundHasBase = true;

        if (isPseudoElement(selectorItem)) {
          compoundHasUnmappedPseudoElement = true;
        }
      }

      if (isPseudoElement(selectorItem)) {
        compoundHasPseudoElement = true;
      }
    });

    if (!variants.length) {
      return { baseSelector: rawSelector, variants: [] };
    }

    if (!baseSelectors.length) {
      // Only variants (e.g. `&:hover` in a selector-less block `{ …; &:hover {…} }`):
      // the utilities can only be merged into a preceding rule with an empty selector
      return { baseSelector: '', variants };
    }

    if (
      // a compound selector can't consist of variants only (e.g. `.foo :hover`)
      !compoundHasBase ||
      // Tailwind puts pseudo-elements last, so `.foo:hover::-webkit-scrollbar` can't be expressed
      compoundHasUnmappedPseudoElement ||
      isVariantAfterPseudoElement
    ) {
      return null;
    }

    const baseSelector =
      rawSelectorPrefix(rawSelector, [baseSelectors]) ??
      stringifySelector([baseSelectors]);

    return baseSelector === null ? null : { baseSelector, variants };
  }

  private makeSelectorVariant(value: string): Variant {
    const orderKey = /^(aria|data)-/.test(value) ? value.split('-')[0] : value;
    const order = SELECTOR_VARIANTS_ORDER.indexOf(orderKey);

    return {
      value,
      kind: 'selector',
      pseudoElement: PSEUDO_ELEMENT_VARIANTS.includes(value),
      order: order === -1 ? undefined : order,
    };
  }

  /**
   * Converts the at-rules around the rule to variants. The at-rules are converted only
   * if all of them (up to the root) are convertible `@media`/`@supports`.
   */
  private resolveContextVariants(
    rule: Rule
  ): { variants: Variant[]; anchor: ChildNode } | null {
    const atRules: AtRule[] = [];
    let anchor: ChildNode = rule;
    let parent: Container | Document | undefined = rule.parent;

    while (isAtRuleNode(parent)) {
      atRules.push(parent);
      anchor = parent;
      parent = parent.parent;
    }

    if (
      !atRules.length ||
      !parent ||
      (parent.type !== 'root' && parent.type !== 'document')
    ) {
      return null;
    }

    let values: string[] | null;

    if (this.isOverridden('convertContainerToClassPrefix')) {
      const variant = this.classPrefixToVariant(
        this.convertContainerToClassPrefix(rule.parent)
      );
      values = variant ? [variant] : null;
    } else {
      values = this.convertAtRulesToVariants(atRules.reverse());
    }

    return values
      ? {
          variants: values.map(value => ({ value, kind: 'at-rule' })),
          anchor,
        }
      : null;
  }

  /**
   * @param atRules at-rules from the outermost to the innermost one
   */
  private convertAtRulesToVariants(atRules: AtRule[]): string[] | null {
    const mediaAtRules: AtRule[] = [];
    const supportsAtRules: AtRule[] = [];

    for (const atRule of atRules) {
      const name = atRule.name.toLowerCase();

      if (name === 'media') {
        mediaAtRules.push(atRule);
      } else if (name === 'supports') {
        supportsAtRules.push(atRule);
      } else {
        return null;
      }
    }

    let mediaVariants: string[] = [];
    if (mediaAtRules.length) {
      const mediaParams = mediaAtRules.map(atRule => atRule.params);
      let mapped: string[] | null;

      if (this.isOverridden('convertMediaParamsToClassPrefix')) {
        const variant = this.classPrefixToVariant(
          this.convertMediaParamsToClassPrefix(mediaParams)
        );
        mapped = variant ? [variant] : null;
      } else {
        mapped = this.convertMediaParamsToVariants(mediaParams);
      }

      if (mapped) {
        mediaVariants = mapped;
      } else if (this.config.arbitraryVariants) {
        for (const atRule of mediaAtRules) {
          const variant = this.makeArbitraryAtRuleVariant(
            'media',
            atRule.params
          );

          if (!variant) {
            return null;
          }

          mediaVariants.push(variant);
        }
      } else {
        return null;
      }
    }

    const supportsVariants: string[] = [];
    const supportsVariant =
      supportsAtRules.length &&
      this.isOverridden('convertSupportsParamsToClassPrefix')
        ? this.classPrefixToVariant(
            this.convertSupportsParamsToClassPrefix(
              supportsAtRules.map(atRule => atRule.params)
            )
          )
        : null;

    if (supportsVariant) {
      supportsVariants.push(supportsVariant);
    }

    for (const atRule of supportsVariant ? [] : supportsAtRules) {
      const variant =
        (this.isOverridden('convertSupportsParamsToClassPrefix')
          ? null
          : this.convertSupportsParamsToVariant(atRule.params)) ||
        (this.config.arbitraryVariants
          ? this.makeArbitraryAtRuleVariant('supports', atRule.params)
          : null);

      if (!variant) {
        return null;
      }

      supportsVariants.push(variant);
    }

    return [...mediaVariants, ...supportsVariants];
  }

  private makeArbitraryAtRuleVariant(name: string, params: string) {
    const trimmed = params.trim();

    if (!trimmed || UNSAFE_ARBITRARY_VARIANT_REGEXP.test(trimmed)) {
      return null;
    }

    return `[@${name}_${escapeArbitraryValue(trimmed)}]`;
  }

  private isDarkModeMedia() {
    const { darkMode } = this.config.tailwindConfig;

    return darkMode == null || darkMode === 'media';
  }

  /**
   * @returns variants or `null` if the media query can't be converted
   */
  protected convertMediaParamsToVariants(
    mediaParams: string[]
  ): string[] | null {
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

        const mapped = getOwn<string>(
          MEDIA_PARAMS_MAPPING,
          param.replace(/\s+/g, '')
        );

        if (!mapped || (mapped === 'dark' && !this.isDarkModeMedia())) {
          return null;
        }

        modifiers.push(mapped);
      }
    }

    if (screens.length > 0) {
      const mappedScreen = getOwn(
        this.config.mapping.screens,
        screens.join(' and ')
      );

      if (!mappedScreen) {
        return null;
      }

      modifiers.push(mappedScreen);
    }

    return modifiers.length ? modifiers : null;
  }

  /**
   * Converts `@supports` with a single declaration condition, e.g. `(display: grid)`.
   */
  protected convertSupportsParamsToVariant(supportsParams: string) {
    if (UNSAFE_ARBITRARY_VARIANT_REGEXP.test(supportsParams)) {
      return null;
    }

    const match = supportsParams
      .trim()
      .match(
        /^\(\s*(--[\w-]+|[a-z-]+)\s*:\s*([^()]*(?:\([^()]*\)[^()]*)*)\)$/i
      );

    if (!match) {
      return null;
    }

    const [variant] = convertDeclarationValue(
      `${match[1]}:${match[2].trim()}`,
      this.config.mapping.supports || {},
      'supports'
    );

    return variant || null;
  }

  protected convertSelectorToVariant(selector: Selector): string | null {
    if (selector.type === 'pseudo' || selector.type === 'pseudo-element') {
      let mappingKey: string | null = null;

      if (selector.data == null) {
        mappingKey = selector.name;
      } else if (typeof selector.data === 'string') {
        mappingKey = `${selector.name}(${selector.data.replace(/\s+/g, '')})`;
      }

      const variant = mappingKey
        ? getOwn<string>(PSEUDOS_MAPPING, mappingKey.toLowerCase())
        : undefined;

      return variant && !DESCENDANT_VARIANTS.includes(variant) ? variant : null;
    }

    if (selector.type === 'attribute') {
      if (selector.name === 'open' && selector.action === 'exists') {
        return 'open';
      }

      if (selector.name.startsWith('aria-')) {
        return this.convertAttributeSelectorToVariant(
          selector,
          'aria',
          this.config.mapping.aria
        );
      }

      if (selector.name.startsWith('data-')) {
        return this.convertAttributeSelectorToVariant(
          selector,
          'data',
          this.config.mapping.data
        );
      }
    }

    return null;
  }

  private convertAttributeSelectorToVariant(
    selector: AttributeSelector,
    variantPrefix: 'aria' | 'data',
    themeMapping: Record<string, string> | undefined
  ) {
    // case-sensitivity flags can't be expressed with variants
    if (selector.ignoreCase === true || selector.ignoreCase === false) {
      return null;
    }

    const mapped = getOwn(
      themeMapping,
      // without `[aria-`/`[data-` and `]`
      this.attributeSelectorToMappingKey(selector, variantPrefix.length + 2)
    );

    if (mapped) {
      return `${variantPrefix}-${mapped}`;
    }

    const attribute = selector.name.slice(variantPrefix.length + 1);

    if (selector.action === 'exists') {
      return `${variantPrefix}-[${attribute}]`;
    }

    // only `[attr=value]`, and without brackets, backslashes, non-space whitespace
    // or repeated spaces (Tailwind collapses them)
    if (
      selector.action !== 'equals' ||
      /[[\]\\]|[^\S ]| {2}/.test(selector.value) ||
      UNSAFE_ARBITRARY_VARIANT_REGEXP.test(selector.value)
    ) {
      return null;
    }

    const value = /^(?:-?[a-z_]|--)[\w-]*$/i.test(selector.value)
      ? selector.value
      : `"${selector.value.replace(/["\\]/g, '\\$&')}"`;

    return `${variantPrefix}-[${attribute}=${escapeArbitraryValue(value)}]`;
  }

  protected cleanRaws(root: Root | Document) {
    root.raws.indent = detectIndent(root);

    root.walkRules(node => {
      node.cleanRaws(true);
    });

    root.walkAtRules(node => {
      node.cleanRaws(true);
    });

    this.removeEmptyContainers(root);
  }

  /**
   * Removes empty rules and at-rules, including the ones that became empty after removing their children.
   */
  private removeEmptyContainers(root: Root | Document) {
    const containers: Array<Rule | AtRule> = [];
    root.walk(node => {
      if ((node.type === 'rule' || node.type === 'atrule') && node.nodes) {
        containers.push(node);
      }
    });

    // the descendants of a container are removed before it, since they follow it in the walk order
    containers.reverse().forEach(node => {
      // an empty `@layer` block still declares the order of the layer
      if (
        !node.nodes?.length &&
        !(node.type === 'atrule' && node.name.toLowerCase() === 'layer')
      ) {
        node.remove();
      }
    });
  }

  /**
   * @deprecated Called only when a subclass overrides `convertRule` or `makeTailwindNode`,
   * which switches to the placement of 1.0.
   */
  protected convertRule(rule: Rule): TailwindNode | null {
    const planned = this.convertRuleDeclarations(
      rule,
      this.createApplyConflictGuard(rule, [])
    );
    planned.forEach(({ declaration }) => declaration.remove());
    const declarations = planned.map(({ converted }) => converted);

    if (!declarations.length) {
      return null;
    }

    const placement = new UtilitiesPlacement();
    placement.place({
      rule,
      declarations,
      anchor: rule,
      baseSelector: rule.selector,
      variants: [],
      mergeable: false,
      allowCreate: false,
    });

    const ruleClassNames = selectorClassNames(rule.selector);
    const [{ tailwindClasses }] = placement.getNodes(
      {
        prefix: this.config.tailwindConfig.prefix,
        separator: this.config.tailwindConfig.separator,
      },
      (className, variants, important) =>
        this.isClassApplicable(className, variants, important, ruleClassNames)
    );

    return this.makeTailwindNode(rule, tailwindClasses);
  }

  /**
   * @deprecated Called only when a subclass overrides `convertRule` or `makeTailwindNode`,
   * which switches to the placement of 1.0.
   */
  protected makeTailwindNode(
    rule: Rule,
    tailwindClasses: string[]
  ): TailwindNode {
    let { baseSelector, classPrefix } = this.parseSelector(rule.selector);

    const classPrefixByParentNodes = this.convertContainerToClassPrefix(
      rule.parent
    );

    if (classPrefixByParentNodes) {
      return {
        key: baseSelector,
        rootRuleSelector: baseSelector,
        originalRule: rule,
        classesPrefix: classPrefixByParentNodes + classPrefix,
        tailwindClasses,
      };
    }

    if (classPrefix) {
      const key = TailwindNodesManager.convertRuleToKey(rule, baseSelector);
      const isRootRule = key === baseSelector;

      return {
        key: key,
        rootRuleSelector: isRootRule ? baseSelector : null,
        originalRule: rule,
        classesPrefix: classPrefix,
        tailwindClasses,
      };
    }

    return { rule, tailwindClasses };
  }

  /**
   * Splits the selector into the base selector and the class prefix of its variants,
   * e.g. `.foo .bar:hover` → `.foo .bar` + `hover:`. Overriding it converts the variants of
   * a selector as a whole (e.g. `.group:hover .foo` → `.foo` + `group-hover:`).
   */
  protected parseSelector(rawSelector: string) {
    const parsed = this.parseSelectorVariants(rawSelector);

    if (!parsed) {
      return { baseSelector: rawSelector, classPrefix: '' };
    }

    return {
      baseSelector: parsed.baseSelector,
      classPrefix: parsed.variants
        .map(variant => variant.value + this.config.tailwindConfig.separator)
        .join(''),
    };
  }

  /**
   * @deprecated Use `convertSelectorToVariant`.
   */
  protected convertSelectorToClassPrefix(selector: Selector) {
    const variant = this.convertSelectorToVariant(selector);

    return variant ? `${variant}${this.config.tailwindConfig.separator}` : null;
  }

  protected attributeSelectorToMappingKey(
    selector: AttributeSelector,
    from = 1
  ) {
    const stringifiedSelector = stringify([[selector]]);

    return stringifiedSelector.substring(from, stringifiedSelector.length - 1);
  }

  /**
   * @deprecated Override `convertMediaParamsToVariants` or `convertSupportsParamsToVariant`.
   */
  protected convertContainerToClassPrefix(container: Container | undefined) {
    if (!isAtRuleNode(container)) {
      return '';
    }

    const atRules: AtRule[] = [];
    let current: Container | Document | undefined = container;

    while (isAtRuleNode(current)) {
      atRules.push(current);
      current = current.parent;
    }

    if (current && current.type !== 'root' && current.type !== 'document') {
      return '';
    }

    const variants = this.convertAtRulesToVariants(atRules.reverse());

    return variants
      ? variants
          .map(variant => variant + this.config.tailwindConfig.separator)
          .join('')
      : '';
  }

  /**
   * @deprecated Use `convertMediaParamsToVariants`.
   */
  protected convertMediaParamsToClassPrefix(mediaParams: string[]) {
    const variants = this.convertMediaParamsToVariants(mediaParams);
    const { separator } = this.config.tailwindConfig;

    return variants ? variants.join(separator) + separator : '';
  }

  /**
   * @deprecated Use `convertSupportsParamsToVariant`.
   */
  protected convertSupportsParamsToClassPrefix(supportParams: string[]) {
    const variants = supportParams.map(params =>
      this.convertSupportsParamsToVariant(params)
    );

    if (!variants.length || variants.some(variant => !variant)) {
      return '';
    }

    return variants
      .map(variant => variant + this.config.tailwindConfig.separator)
      .join('');
  }
}
