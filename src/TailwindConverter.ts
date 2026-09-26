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
  PSEUDOS_MAPPING,
  PSEUDO_ELEMENT_VARIANTS,
  SELECTOR_VARIANTS_ORDER,
} from './mappings/pseudos-mapping';
import { detectIndent } from './utils/detectIndent';
import { getOwn } from './utils/getOwn';
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
  safeParseSelector,
  selectorClassNames,
  stringifySelector,
} from './core/selector';

export interface TailwindConverterConfig {
  remInPx?: number | null;
  tailwindConfig?: Config;
  postCSSPlugins: AcceptedPlugin[];
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

function isPseudoElement(selector: Selector) {
  return (
    selector.type === 'pseudo-element' ||
    (selector.type === 'pseudo' &&
      LEGACY_PSEUDO_ELEMENTS.includes(selector.name.toLowerCase()))
  );
}

interface RuleLocation {
  anchor: ChildNode;
  baseSelector: string;
  variants: Variant[];
  mergeable: boolean;
}

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
    const parsed = await postcss(this.config.postCSSPlugins).process(css, {
      parser: postcssSafeParser,
      from: undefined,
      // don't load previous source maps referenced by the input
      map: false,
    });

    // Rules are collected beforehand, since placing utilities inserts new rules into the tree
    const rules: Rule[] = [];
    parsed.root.walkRules(rule => {
      rules.push(rule);
    });

    const fileClassNames = new Set<string>();
    rules.forEach(rule => {
      selectorClassNames(rule.selector).forEach(className =>
        fileClassNames.add(className)
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
      rules.forEach(rule =>
        this.convertRuleInPlacement(rule, placement, fileClassNames)
      );

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
            selectorClassNames(rule.selector),
            fileClassNames
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

    this.cleanRaws(parsed.root);

    return {
      nodes: nodes.filter(node => node.tailwindClasses.length),
      convertedRoot: parsed.root,
    };
  }

  /**
   * The 1.x conversion, used when a subclass overrides `convertRule` or `makeTailwindNode`.
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
   * Checks whether a subclass overrides a method of the 1.x API. The conversion calls an overridden
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
   * Converts a class prefix returned by a 1.x method (e.g. `md:hover:`) to a variant.
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

  protected convertRuleInPlacement(
    rule: Rule,
    placement: UtilitiesPlacement,
    fileClassNames: Set<string> = new Set()
  ) {
    if (!isConvertibleContext(rule)) {
      return;
    }

    const location = this.resolveRuleLocation(rule);
    const declarations = this.convertRuleDeclarations(
      rule,
      this.createApplyConflictGuard(rule, location.variants, fileClassNames)
    );

    if (!declarations.length) {
      return;
    }

    const isPlaced = placement.place({
      rule,
      declarations,
      ...location,
      allowCreate: location.baseSelector.trim() !== '',
    });

    if (!isPlaced) {
      // there is no base rule to move the variants to, keep the rule as is
      placement.place({
        rule,
        declarations,
        anchor: rule,
        baseSelector: rule.selector,
        variants: [],
        mergeable: false,
        allowCreate: false,
      });
    }
  }

  /**
   * Returns a check for utilities that can't be used with `@apply` in the rule:
   * - Tailwind throws on `@apply` of a class inside a rule whose selector contains the same class
   *   (e.g. `.float-left { @apply float-left }`);
   * - `@apply` of a class also applies the rules of the same file that use this class
   *   (e.g. `@apply float-left` copies the declarations of `.foo .float-left { … }`).
   */
  protected createApplyConflictGuard(
    rule: Rule,
    variants: Variant[],
    fileClassNames: Set<string> = new Set()
  ) {
    const ruleClassNames = selectorClassNames(rule.selector);
    const variantValues = variants.map(variant => variant.value);

    return (utility: ConvertedUtility, important: boolean) =>
      this.isClassApplicable(
        utility.className,
        variantValues,
        important,
        ruleClassNames,
        fileClassNames
      );
  }

  private isClassApplicable(
    className: string,
    variants: string[],
    important: boolean,
    ruleClassNames: Set<string>,
    fileClassNames: Set<string>
  ) {
    const formatOptions = {
      prefix: this.config.tailwindConfig.prefix,
      separator: this.config.tailwindConfig.separator,
    };
    const candidate = formatUtilityClass(
      className,
      variants,
      false,
      formatOptions
    );
    const baseCandidate = formatUtilityClass(
      className,
      [],
      false,
      formatOptions
    );

    return !(
      fileClassNames.has(candidate) ||
      ruleClassNames.has(candidate) ||
      ruleClassNames.has(baseCandidate) ||
      (important &&
        ruleClassNames.has(
          formatUtilityClass(className, [], true, formatOptions)
        ))
    );
  }

  /**
   * Converts the rule's own declarations and removes the converted ones.
   * A declaration is left as is if converting it could change which declaration wins:
   * `@apply` is inserted before the remaining declarations of the rule.
   */
  protected convertRuleDeclarations(
    rule: Rule,
    isUtilityAllowed: (
      utility: ConvertedUtility,
      important: boolean
    ) => boolean = () => true
  ): ConvertedDeclaration[] {
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
        : this.convertDeclarationToUtilities(declaration)
    );

    /**
     * A utility may set more than its declaration (e.g. `border-solid` for `border-top: 1px solid`
     * sets the style of all sides). Other declarations of the rule setting these properties must be
     * converted to the same utility, and with `strict` they must set all of them.
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
          (!this.config.strict ||
            sideEffectProps.every(p =>
              others.some(otherIndex =>
                declarationsProps[otherIndex].includes(p)
              )
            ))
        );
      });

    const orderSensitiveProps = new Set<string>();
    const converted: ConvertedDeclaration[] = [];

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

      declaration.remove();
      converted.push({
        declarationProps,
        overriddenProps: definiteLonghandsOf(declaration.prop),
        important: !!declaration.important,
        utilities,
      });
    });

    return converted;
  }

  protected convertDeclarationToUtilities(
    declaration: Declaration
  ): ConvertedUtility[] {
    if (!declaration.value.trim()) {
      return [];
    }

    const props = longhandsOf(declaration.prop);
    const utilitiesConverter = getOwn(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING,
      declaration.prop
    );

    if (
      !utilitiesConverter ||
      this.isOverridden('convertDeclarationToClasses')
    ) {
      return this.convertDeclarationToClasses(declaration).map(className => ({
        className,
        props,
      }));
    }

    const utilities = utilitiesConverter(declaration, this.config);

    if (utilities.length || !this.config.arbitraryPropertiesIsEnabled) {
      return utilities;
    }

    return [{ className: this.makeArbitraryProperty(declaration), props }];
  }

  protected convertDeclarationToClasses(declaration: Declaration) {
    if (!declaration.value.trim()) {
      return [];
    }

    let classes =
      getOwn(DECLARATION_CONVERTERS_MAPPING, declaration.prop)?.(
        declaration,
        this.config
      ) || [];

    if (classes.length === 0 && this.config.arbitraryPropertiesIsEnabled) {
      return [this.makeArbitraryProperty(declaration)];
    }

    return classes;
  }

  protected makeArbitraryProperty(declaration: Declaration) {
    return `[${declaration.prop}:${prepareArbitraryValue(declaration.value)}]`;
  }

  /**
   * Finds out where the rule's utilities should go: variants are extracted from the selector
   * (`:hover`, `[aria-*]`, …) and from the at-rules around the rule (`@media`, `@supports`),
   * and the utilities are moved to a rule with the remaining base selector.
   */
  protected resolveRuleLocation(rule: Rule): RuleLocation {
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
  protected parseSelectorVariants(
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
      // the whole selector consists of variants (e.g. `:hover` from a nested `&:hover` in a css part
      // without a selector): the base is an empty selector, the utilities can only be merged into a
      // preceding rule with an empty selector
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

    const baseSelector = stringifySelector([baseSelectors]);

    return baseSelector === null ? null : { baseSelector, variants };
  }

  protected makeSelectorVariant(value: string): Variant {
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
  protected resolveContextVariants(
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
  protected convertAtRulesToVariants(atRules: AtRule[]): string[] | null {
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

  protected makeArbitraryAtRuleVariant(name: string, params: string) {
    const trimmed = params.trim();

    if (!trimmed || UNSAFE_ARBITRARY_VARIANT_REGEXP.test(trimmed)) {
      return null;
    }

    return `[@${name}_${trimmed.replace(/_/g, '\\_').replace(/\s+/g, '_')}]`;
  }

  protected isDarkModeMedia() {
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

      return mappingKey
        ? getOwn<string>(PSEUDOS_MAPPING, mappingKey.toLowerCase()) || null
        : null;
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

  protected convertAttributeSelectorToVariant(
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
      this.attributeSelectorToMappingKey(selector, 6)
    );

    if (mapped) {
      return `${variantPrefix}-${mapped}`;
    }

    const attribute = selector.name.slice(variantPrefix.length + 1);

    if (selector.action === 'exists') {
      return `${variantPrefix}-[${attribute}]`;
    }

    if (
      selector.action !== 'equals' ||
      /[[\]\\]|[^\S ]/.test(selector.value) ||
      UNSAFE_ARBITRARY_VARIANT_REGEXP.test(selector.value)
    ) {
      return null;
    }

    const value = /^(?:-?[a-z_]|--)[\w-]*$/i.test(selector.value)
      ? selector.value
      : `"${selector.value.replace(/"/g, '\\"')}"`;

    return `${variantPrefix}-[${attribute}=${value
      .replace(/_/g, '\\_')
      .replace(/ /g, '_')}]`;
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
  protected removeEmptyContainers(container: Root | Document | Container) {
    container.each(node => {
      if (node.type !== 'rule' && node.type !== 'atrule') {
        return;
      }

      if (node.nodes) {
        this.removeEmptyContainers(node);

        // an empty `@layer` block still declares the order of the layer
        if (
          node.nodes.length === 0 &&
          !(node.type === 'atrule' && node.name.toLowerCase() === 'layer')
        ) {
          node.remove();
        }
      }
    });
  }

  /**
   * @deprecated Kept for backward compatibility, the conversion is done by `convertCSS`.
   */
  protected convertRule(rule: Rule): TailwindNode | null {
    const declarations = this.convertRuleDeclarations(
      rule,
      this.createApplyConflictGuard(rule, [])
    );

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
        this.isClassApplicable(
          className,
          variants,
          important,
          ruleClassNames,
          new Set()
        )
    );

    return this.makeTailwindNode(rule, tailwindClasses);
  }

  /**
   * @deprecated Kept for backward compatibility, the conversion is done by `convertCSS`.
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
   * @deprecated Use `parseSelectorVariants`.
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
   * @deprecated Use `resolveContextVariants`.
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
