const CSS_WIDE_KEYWORDS = [
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
];

export function isCSSWideKeyword(value: string) {
  return CSS_WIDE_KEYWORDS.includes(value.trim().toLowerCase());
}
