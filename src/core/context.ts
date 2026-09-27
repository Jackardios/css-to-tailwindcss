import type { AtRule, Container, Document, Rule } from 'postcss';

/**
 * At-rules whose nested rules are converted like top-level rules (Tailwind's layers are handled below).
 * Rules in other at-rules are left as is: some don't select elements (`@keyframes`, `@font-face`, `@page`),
 * others change how their rules apply (`@scope`, `@starting-style`, native `@layer`).
 */
const STYLE_CONTAINER_AT_RULES = new Set(['media', 'supports', 'container']);

/**
 * Layers that Tailwind processes itself. Utilities don't work inside native cascade layers:
 * the unlayered `--tw-*` defaults of the preflight override the variables they set.
 */
const TAILWIND_LAYERS = new Set(['base', 'components', 'utilities']);

function isStyleContainerAtRule(atRule: AtRule) {
  const name = atRule.name.toLowerCase();

  return name === 'layer'
    ? TAILWIND_LAYERS.has(atRule.params.trim())
    : STYLE_CONTAINER_AT_RULES.has(name);
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
      if (!isStyleContainerAtRule(parent as AtRule)) {
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
