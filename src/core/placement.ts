import { AtRule, ChildNode, Declaration, Node, Rule } from 'postcss';

import { isNonStyleAtRuleName } from './context';
import {
  ANY_PROPERTY,
  isPropertySubset,
  longhandsOf,
  propertiesIntersect,
} from './longhands';
import { normalizeSelectorKey } from './selector';
import { reduceTailwindClasses } from '../utils/reduceTailwindClasses';

export interface ConvertedUtility {
  /** Utility class name without variants, prefix and important modifier. */
  className: string;
  /** Longhand CSS properties that this utility stands for. */
  props: string[];
  /**
   * Set when the utilities don't reproduce all the parts the declaration resets
   * (e.g. `border-r-0` for `border-right: none` doesn't reset the style): such a declaration
   * is converted only if the following declarations of the rule don't set the same properties.
   */
  partial?: boolean;
}

export interface ConvertedDeclaration {
  /** Longhand CSS properties set (or reset) by the source declaration, including the ones it may alias. */
  declarationProps: string[];
  /**
   * Longhand CSS properties the source declaration sets in any case
   * (logical properties don't certainly override physical ones). Defaults to `declarationProps`.
   */
  overriddenProps?: string[];
  important: boolean;
  utilities: ConvertedUtility[];
}

export type VariantKind = 'selector' | 'at-rule';

export interface Variant {
  value: string;
  kind: VariantKind;
  /** Set for variants that style a pseudo-element (`before`, `placeholder`, …) instead of the element. */
  pseudoElement?: boolean;
  /**
   * Position of a selector variant in the order Tailwind emits variants of equal specificity,
   * if known. Variants with the same position are considered unordered.
   */
  order?: number;
}

export interface PlacementRequest {
  /** The source rule whose declarations were converted. */
  rule: Rule;
  /** The node whose position is kept: the rule itself or its outermost hoisted at-rule. */
  anchor: ChildNode;
  /** Selector of the rule that should receive the utilities. */
  baseSelector: string;
  variants: Variant[];
  declarations: ConvertedDeclaration[];
  /** Whether utilities may be merged into a preceding rule with the same selector. */
  mergeable: boolean;
  /** Whether a new rule may be created when there is no suitable preceding rule. */
  allowCreate: boolean;
}

interface PlacedUtility extends ConvertedUtility {
  variants: Variant[];
  variantsKey: string;
  important: boolean;
  declarationProps: string[];
  overriddenProps: string[];
  declarationId: number;
  sourceId: number;
}

interface Target {
  rule: Rule;
  utilities: PlacedUtility[];
  /**
   * Utilities by the properties they stand for, one per group of utilities that
   * `canFollow` treats the same way (the same variants, arbitrary property or not), to find overlapping ones quickly.
   */
  utilitiesByProp: Map<string, Map<string, PlacedUtility>>;
}

export interface FormatOptions {
  prefix: string;
  separator: string;
}

/**
 * Checks whether a class (without variants, prefix and important modifier) can be applied in the rule.
 */
export type ClassApplicabilityCheck = (
  className: string,
  variants: string[],
  important: boolean,
  rule: Rule
) => boolean;

export interface PlacedNode {
  rule: Rule;
  tailwindClasses: string[];
}

function variantsKeyOf(variants: Variant[]) {
  return variants.map(variant => variant.value).join('\u0000');
}

function atRuleVariantsKeyOf(variants: Variant[]) {
  return variantsKeyOf(variants.filter(variant => variant.kind === 'at-rule'));
}

function pseudoElementOf(variants: Variant[]) {
  return variants.find(variant => variant.pseudoElement)?.value || null;
}

/** How many preceding siblings are looked through, so that big files are converted in linear time. */
const MAX_LOOKBEHIND = 500;

/**
 * Returns the nearest preceding sibling of the node matching the predicate.
 * The sibling at the lookbehind limit is returned without checking the predicate, so it blocks
 * moving utilities further unless the caller checks it itself (the siblings in between were checked).
 */
function findPrecedingSibling(
  node: ChildNode,
  predicate: (sibling: ChildNode) => boolean
): ChildNode | null {
  const siblings = node.parent?.nodes || [];
  const index = siblings.indexOf(node);

  for (let i = index - 1; i >= 0; i--) {
    if (index - i > MAX_LOOKBEHIND || predicate(siblings[i])) {
      return siblings[i];
    }
  }

  return null;
}

function selectorVariantValues(variants: Variant[]) {
  return new Set(
    variants
      .filter(variant => variant.kind === 'selector')
      .map(variant => variant.value)
  );
}

function isSubset<T>(subset: Set<T>, superset: Set<T>) {
  return Array.from(subset).every(value => superset.has(value));
}

function isArbitraryProperty(utility: ConvertedUtility) {
  return utility.className[0] === '[';
}

/** Tailwind sets `content: var(--tw-content)` for these variants unless the utility sets `content`. */
const CONTENT_PSEUDO_ELEMENTS = ['before', 'after'];

function isContentUtility(utility: ConvertedUtility) {
  return utility.className.startsWith('content-');
}

export function formatUtilityClass(
  className: string,
  variants: string[],
  important: boolean,
  { prefix, separator }: FormatOptions
) {
  const isArbitraryProperty = className[0] === '[';
  const body =
    (important ? '!' : '') +
    (isArbitraryProperty ? className : `${prefix}${className}`);

  return variants.length
    ? `${variants.join(separator)}${separator}${body}`
    : body;
}

/**
 * Places converted utilities into rules so that the resulting CSS keeps the cascade order of the source:
 * utilities are moved into a preceding rule with the same selector only if nothing in between
 * (and nothing in that rule) could be overridden differently than in the source.
 */
export class UtilitiesPlacement {
  protected targets = new Map<Rule, Target>();
  protected targetsBySelectorKey = new Map<string, Target[]>();
  protected declarationsCount = 0;
  protected sourcesCount = 0;
  protected selectorKeys = new Map<string, string>();
  protected effectivePropsCache = new WeakMap<Node, Set<string>>();

  protected selectorKeyOf(selector: string) {
    let key = this.selectorKeys.get(selector);

    if (key === undefined) {
      key = normalizeSelectorKey(selector);
      this.selectorKeys.set(selector, key);
    }

    return key;
  }

  /**
   * Returns `false` if the utilities with variants can't be moved to a base rule;
   * the caller then places them into the source rule without variants.
   */
  place(request: PlacementRequest): boolean {
    const utilities = this.toPlacedUtilities(request);

    if (!utilities.length) {
      return true;
    }

    if (!request.variants.length) {
      this.addUtilities(request.rule, utilities);

      return true;
    }

    if (
      this.isOverriddenInsideAnchor(request, utilities) ||
      !this.hasContentForPseudoElement(request, utilities)
    ) {
      return false;
    }

    let targetRule = request.mergeable
      ? this.findPrecedingTarget(
          request.anchor,
          this.selectorKeyOf(request.baseSelector),
          utilities
        )
      : null;

    if (!targetRule) {
      if (!request.allowCreate) {
        return false;
      }

      targetRule = new Rule({
        selector: request.baseSelector,
        raws: { semicolon: true },
      });
      request.anchor.before(targetRule);
    }

    this.addUtilities(targetRule, utilities);

    return true;
  }

  /** Whether utilities were placed into the rule. */
  hasUtilities(rule: Rule) {
    return this.targets.has(rule);
  }

  getNodes(
    formatOptions: FormatOptions,
    isClassApplicable: ClassApplicabilityCheck = () => true
  ): PlacedNode[] {
    return Array.from(this.targets.values()).map(target => ({
      rule: target.rule,
      tailwindClasses: this.resolveClasses(
        target,
        formatOptions,
        isClassApplicable
      ),
    }));
  }

  protected toPlacedUtilities(request: PlacementRequest) {
    const variantsKey = variantsKeyOf(request.variants);
    const sourceId = this.sourcesCount++;
    const utilities: PlacedUtility[] = [];

    request.declarations.forEach(declaration => {
      const declarationId = this.declarationsCount++;

      declaration.utilities.forEach(utility => {
        utilities.push({
          ...utility,
          variants: request.variants,
          variantsKey,
          important: declaration.important,
          declarationProps: declaration.declarationProps,
          overriddenProps:
            declaration.overriddenProps || declaration.declarationProps,
          declarationId,
          sourceId,
        });
      });
    });

    return utilities;
  }

  protected getOrCreateTarget(rule: Rule) {
    let target = this.targets.get(rule);

    if (!target) {
      target = { rule, utilities: [], utilitiesByProp: new Map() };
      this.targets.set(rule, target);

      const selectorKey = this.selectorKeyOf(rule.selector);
      const targets = this.targetsBySelectorKey.get(selectorKey) || [];
      targets.push(target);
      this.targetsBySelectorKey.set(selectorKey, targets);
    }

    return target;
  }

  protected addUtilities(rule: Rule, utilities: PlacedUtility[]) {
    const target = this.getOrCreateTarget(rule);

    utilities.forEach(utility => {
      const group = `${utility.variantsKey}|${isArbitraryProperty(utility)}`;

      target.utilities.push(utility);
      utility.props.forEach(p => {
        const byProp = target.utilitiesByProp.get(p) || new Map();
        if (!byProp.has(group)) {
          byProp.set(group, utility);
        }
        target.utilitiesByProp.set(p, byProp);
      });
    });

    this.invalidateEffectiveProps(rule);
  }

  /** Forgets the cached properties of the node and its ancestors (e.g. after removing declarations). */
  invalidateEffectiveProps(node: Node) {
    let current: Node | undefined = node;

    while (current) {
      this.effectivePropsCache.delete(current);
      current = current.parent as Node | undefined;
    }
  }

  /**
   * Returns the utilities of the target that set any of the properties (one per group of equivalent ones).
   */
  protected overlappingUtilities(target: Target, props: string[]) {
    const result = new Set<PlacedUtility>();
    const add = (byProp?: Map<string, PlacedUtility>) =>
      byProp?.forEach(utility => result.add(utility));

    if (props.includes(ANY_PROPERTY)) {
      target.utilitiesByProp.forEach(add);
    } else {
      add(target.utilitiesByProp.get(ANY_PROPERTY));
      props.forEach(p => add(target.utilitiesByProp.get(p)));
    }

    return Array.from(result);
  }

  /**
   * The utilities of a rule hoisted out of at-rules are placed before them, so they must not overlap
   * with the CSS preceding the rule inside these at-rules.
   */
  protected isOverriddenInsideAnchor(
    request: PlacementRequest,
    utilities: PlacedUtility[]
  ) {
    const props = new Set<string>();
    utilities.forEach(utility => utility.props.forEach(p => props.add(p)));

    let node: ChildNode = request.rule;

    while (node !== request.anchor && node.parent) {
      if (
        findPrecedingSibling(node, sibling =>
          propertiesIntersect(this.effectiveProps(sibling), props)
        )
      ) {
        return true;
      }

      node = node.parent as ChildNode;
    }

    return false;
  }

  /**
   * `before:`/`after:` utilities set `content: var(--tw-content)`, which overrides the `content`
   * of the source CSS. They are used only together with a `content-*` utility for the same pseudo-element.
   */
  protected hasContentForPseudoElement(
    request: PlacementRequest,
    utilities: PlacedUtility[]
  ) {
    const pseudoElement = pseudoElementOf(request.variants);

    if (
      !pseudoElement ||
      !CONTENT_PSEUDO_ELEMENTS.includes(pseudoElement) ||
      utilities.some(isContentUtility)
    ) {
      return true;
    }

    const variantValues = new Set(request.variants.map(v => v.value));
    const targets =
      this.targetsBySelectorKey.get(this.selectorKeyOf(request.baseSelector)) ||
      [];

    return targets.some(target =>
      target.utilities.some(
        utility =>
          isContentUtility(utility) &&
          pseudoElementOf(utility.variants) === pseudoElement &&
          utility.variants.every(v => variantValues.has(v.value))
      )
    );
  }

  protected findPrecedingTarget(
    anchor: ChildNode,
    selectorKey: string,
    utilities: PlacedUtility[]
  ): Rule | null {
    const props = new Set<string>();
    utilities.forEach(utility => utility.props.forEach(p => props.add(p)));

    const isTarget = (node: ChildNode): node is Rule =>
      node.type === 'rule' && this.selectorKeyOf(node.selector) === selectorKey;

    // utilities can be moved only over nodes that don't set the same properties
    const node = findPrecedingSibling(
      anchor,
      sibling =>
        isTarget(sibling) ||
        propertiesIntersect(this.effectiveProps(sibling), props)
    );

    return node && isTarget(node) && this.canMergeInto(node, utilities)
      ? node
      : null;
  }

  protected canMergeInto(rule: Rule, utilities: PlacedUtility[]) {
    // Tailwind emits declarations left in the target rule after everything generated by its `@apply`
    // (including rules for variants), so they would override merged utilities unless a selector
    // variant makes the utility more specific.
    const remainingProps = new Set<string>();
    rule.each(child => {
      this.effectiveProps(child).forEach(p => remainingProps.add(p));
    });

    const target = this.targets.get(rule);

    return utilities.every(utility => {
      if (
        !utility.variants.some(variant => variant.kind === 'selector') &&
        propertiesIntersect(utility.props, remainingProps)
      ) {
        return false;
      }

      return (
        !target ||
        this.overlappingUtilities(target, utility.props).every(
          existingUtility => this.canFollow(existingUtility, utility)
        )
      );
    });
  }

  /**
   * Whether `later` may be merged after `earlier` (overlapping properties) without changing
   * which of them wins in the source cascade.
   */
  protected canFollow(earlier: PlacedUtility, later: PlacedUtility) {
    // Utilities for different pseudo-elements (or for a pseudo-element and the element) never compete
    if (pseudoElementOf(earlier.variants) !== pseudoElementOf(later.variants)) {
      return true;
    }

    const earlierValues = new Set(earlier.variants.map(v => v.value));
    const laterValues = new Set(later.variants.map(v => v.value));
    const earlierSelectorValues = selectorVariantValues(earlier.variants);
    const laterSelectorValues = selectorVariantValues(later.variants);

    // The earlier utility has more selector variants, so it's more specific: it wins both in the source
    // and in Tailwind, whatever the order and the at-rules are.
    if (
      earlierSelectorValues.size > laterSelectorValues.size &&
      isSubset(laterSelectorValues, earlierSelectorValues)
    ) {
      return true;
    }

    // Tailwind emits arbitrary properties after all other utilities with the same variants
    if (
      isSubset(earlierValues, laterValues) &&
      isSubset(laterValues, earlierValues) &&
      isArbitraryProperty(earlier)
    ) {
      return false;
    }

    // The same variants in a different order (e.g. `focus:hover:` and `hover:focus:`) generate
    // selectors of equal specificity that Tailwind emits in its own order
    if (
      earlierValues.size === laterValues.size &&
      isSubset(earlierValues, laterValues) &&
      earlier.variantsKey !== later.variantsKey
    ) {
      return false;
    }

    // The later utility is equally or more specific: it wins both in the source and in Tailwind.
    if (isSubset(earlierValues, laterValues)) {
      return true;
    }

    // Different selector variants of equal specificity under the same at-rules: the later one wins
    // in the source, and in Tailwind if its variant is emitted later.
    const earlierSelector = earlier.variants.filter(v => v.kind === 'selector');
    const laterSelector = later.variants.filter(v => v.kind === 'selector');

    return (
      atRuleVariantsKeyOf(earlier.variants) ===
        atRuleVariantsKeyOf(later.variants) &&
      earlierSelector.length === 1 &&
      laterSelector.length === 1 &&
      earlierSelector[0].order != null &&
      laterSelector[0].order != null &&
      laterSelector[0].order > earlierSelector[0].order
    );
  }

  /**
   * Returns the properties that the node (with the utilities placed into it) may set.
   */
  protected effectiveProps(node: Node): Set<string> {
    if (node.type === 'decl') {
      return new Set(longhandsOf((node as Declaration).prop));
    }

    let result = this.effectivePropsCache.get(node);

    if (result) {
      return result;
    }

    result = new Set<string>();
    const addChildren = (container: Rule | AtRule) => {
      container.each(child => {
        this.effectiveProps(child).forEach(p => result?.add(p));
      });
    };

    if (node.type === 'rule') {
      this.targets
        .get(node as Rule)
        ?.utilitiesByProp.forEach((_, p) => result?.add(p));
      addChildren(node as Rule);
    } else if (node.type === 'atrule') {
      const { name, nodes } = node as AtRule;

      if (name.toLowerCase() === 'apply') {
        // an existing `@apply` may set anything
        result.add(ANY_PROPERTY);
      } else if (nodes && !isNonStyleAtRuleName(name)) {
        addChildren(node as AtRule);
      }
    }

    this.effectivePropsCache.set(node, result);

    return result;
  }

  protected resolveClasses(
    target: Target,
    formatOptions: FormatOptions,
    isClassApplicable: ClassApplicabilityCheck = () => true
  ) {
    const utilities = this.dropOverriddenUtilities(target.utilities);

    // Reduce classes per source rule chunk to keep the output close to the source order
    const chunks: PlacedUtility[][] = [];
    const chunksByKey = new Map<string, PlacedUtility[]>();
    utilities.forEach(utility => {
      const key = `${utility.sourceId}|${utility.variantsKey}|${utility.important}`;
      let chunk = chunksByKey.get(key);
      if (!chunk) {
        chunk = [];
        chunksByKey.set(key, chunk);
        chunks.push(chunk);
      }
      chunk.push(utility);
    });

    const classes: string[] = [];
    chunks.forEach(chunk => {
      const { variants, important } = chunk[0];
      const variantValues = variants.map(v => v.value);
      const classNames = Array.from(new Set(chunk.map(u => u.className)));
      let reduced = reduceTailwindClasses(classNames);

      // the source classes were checked before, but the reduced ones may conflict with the rules of the file
      if (
        reduced.some(
          className =>
            !classNames.includes(className) &&
            !isClassApplicable(className, variantValues, important, target.rule)
        )
      ) {
        reduced = classNames;
      }

      reduced.forEach(className => {
        classes.push(
          formatUtilityClass(className, variantValues, important, formatOptions)
        );
      });
    });

    return Array.from(new Set(classes));
  }

  /**
   * Drops utilities whose properties are entirely overridden by later declarations
   * with the same variants and importance (the later one wins in CSS, but not necessarily in Tailwind).
   * Tailwind also collapses duplicate declarations of a rule regardless of `!important`,
   * so normal utilities entirely overridden by important ones with the same variants are dropped as well.
   */
  protected dropOverriddenUtilities(utilities: PlacedUtility[]) {
    const importantProps = new Map<string, Set<string>>();
    utilities.forEach(utility => {
      if (utility.important) {
        const props = importantProps.get(utility.variantsKey) || new Set();
        utility.overriddenProps.forEach(p => props.add(p));
        importantProps.set(utility.variantsKey, props);
      }
    });

    const isOverridden = (utility: PlacedUtility, props?: Set<string>) =>
      !!props?.size && isPropertySubset(utility.props, props);

    const laterProps = new Map<string, Set<string>>();
    const kept = utilities.map(() => true);
    let end = utilities.length - 1;

    // the utilities of a declaration are adjacent, they don't override each other
    while (end >= 0) {
      let start = end;
      while (
        start > 0 &&
        utilities[start - 1].declarationId === utilities[end].declarationId
      ) {
        start--;
      }

      for (let i = start; i <= end; i++) {
        const utility = utilities[i];
        const key = `${utility.variantsKey}|${utility.important}`;

        kept[i] = !(
          isOverridden(utility, laterProps.get(key)) ||
          (!utility.important &&
            isOverridden(utility, importantProps.get(utility.variantsKey)))
        );
      }

      for (let i = start; i <= end; i++) {
        const utility = utilities[i];
        const key = `${utility.variantsKey}|${utility.important}`;
        const props = laterProps.get(key) || new Set();
        utility.overriddenProps.forEach(p => props.add(p));
        laterProps.set(key, props);
      }

      end = start - 1;
    }

    return utilities.filter((_, index) => kept[index]);
  }
}
