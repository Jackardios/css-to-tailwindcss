import type { Container, Document, Rule } from 'postcss';

/**
 * At-rules whose nested rules style elements the same way as top-level rules.
 * Rules inside any other at-rule (`@keyframes`, `@font-face`, `@page`, …) are not selectors of elements
 * and must never be converted.
 */
const STYLE_CONTAINER_AT_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
]);

export function isStyleContainerAtRuleName(name: string) {
  return STYLE_CONTAINER_AT_RULES.has(name.toLowerCase());
}

/**
 * At-rules whose content doesn't style elements. Unknown at-rules (`@scope`, `@starting-style`, …)
 * may style elements.
 */
const NON_STYLE_AT_RULES = new Set([
  'font-face',
  'font-feature-values',
  'font-palette-values',
  'counter-style',
  'property',
  'page',
  'color-profile',
  'view-transition',
]);

export function isNonStyleAtRuleName(name: string) {
  const normalized = name.toLowerCase();

  return (
    NON_STYLE_AT_RULES.has(normalized) || /(^|-)keyframes$/.test(normalized)
  );
}

/**
 * Returns true if the rule's declarations can be converted to utilities.
 */
export function isConvertibleContext(rule: Rule) {
  let parent: Container | Document | undefined = rule.parent;

  while (parent && parent.type !== 'root' && parent.type !== 'document') {
    if (parent.type === 'atrule') {
      if (!isStyleContainerAtRuleName((parent as any).name)) {
        return false;
      }
    } else if (parent.type !== 'rule') {
      return false;
    }

    parent = parent.parent;
  }

  return true;
}

/**
 * Returns true if the rule is nested in another rule (nesting that wasn't flattened by a plugin).
 */
export function hasRuleAncestor(rule: Rule) {
  let parent: Container | Document | undefined = rule.parent;

  while (parent && parent.type !== 'root' && parent.type !== 'document') {
    if (parent.type === 'rule') {
      return true;
    }

    parent = parent.parent;
  }

  return false;
}
