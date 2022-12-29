import type { Selector } from 'css-what';

const ARIA_ATTRIBUTE_NAMES = [
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-hidden',
  'aria-pressed',
  'aria-readonly',
  'aria-required',
  'aria-selected',
];

export function isAriaSelector(selector: Selector) {
  return (
    selector.type === 'attribute' &&
    ARIA_ATTRIBUTE_NAMES.includes(selector.name) &&
    selector.value === 'true'
  );
}
