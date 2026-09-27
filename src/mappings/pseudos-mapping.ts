export const PSEUDOS_MAPPING = {
  hover: 'hover',
  focus: 'focus',
  'focus-within': 'focus-within',
  'focus-visible': 'focus-visible',
  active: 'active',
  visited: 'visited',
  target: 'target',
  'first-child': 'first',
  'last-child': 'last',
  'only-child': 'only',
  'nth-child(odd)': 'odd',
  'nth-child(2n+1)': 'odd',
  'nth-child(even)': 'even',
  'nth-child(2n)': 'even',
  'first-of-type': 'first-of-type',
  'last-of-type': 'last-of-type',
  'only-of-type': 'only-of-type',
  empty: 'empty',
  disabled: 'disabled',
  enabled: 'enabled',
  checked: 'checked',
  indeterminate: 'indeterminate',
  default: 'default',
  required: 'required',
  valid: 'valid',
  invalid: 'invalid',
  'in-range': 'in-range',
  'out-of-range': 'out-of-range',
  'placeholder-shown': 'placeholder-shown',
  autofill: 'autofill',
  optional: 'optional',
  'read-only': 'read-only',
  before: 'before',
  after: 'after',
  'first-letter': 'first-letter',
  'first-line': 'first-line',
  marker: 'marker',
  selection: 'selection',
  'file-selector-button': 'file',
  placeholder: 'placeholder',
  backdrop: 'backdrop',
};

/**
 * Variants that also style the descendants (`& *::marker`), so selectors aren't converted to them.
 * @internal
 */
export const DESCENDANT_VARIANTS = ['marker', 'selection'];

/**
 * Variants that style a pseudo-element instead of the element itself.
 * @internal
 */
export const PSEUDO_ELEMENT_VARIANTS = [
  'first-letter',
  'first-line',
  'marker',
  'selection',
  'file',
  'placeholder',
  'backdrop',
  'before',
  'after',
];

/**
 * The order in which Tailwind 3 emits rules of single-selector variants of equal specificity.
 * A rule of a variant later in this list overrides a rule of an earlier one.
 * @internal
 */
export const SELECTOR_VARIANTS_ORDER = [
  'first',
  'last',
  'only',
  'odd',
  'even',
  'first-of-type',
  'last-of-type',
  'only-of-type',
  'visited',
  'target',
  'open',
  'default',
  'checked',
  'indeterminate',
  'placeholder-shown',
  'autofill',
  'optional',
  'required',
  'valid',
  'invalid',
  'in-range',
  'out-of-range',
  'read-only',
  'empty',
  'focus-within',
  'hover',
  'focus',
  'focus-visible',
  'active',
  'enabled',
  'disabled',
  // all `aria-*` variants share a position, as well as all `data-*` variants
  'aria',
  'data',
];
