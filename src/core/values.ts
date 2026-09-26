import valueParser from 'postcss-value-parser';

const CSS_WIDE_KEYWORDS = [
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
];

const TIME_REGEXP = /^[+-]?(\d*\.)?\d+(m?s)$/i;

export interface CSSFunction {
  name: string;
  args: string[];
}

function stringifyNodes(nodes: valueParser.Node[]) {
  return valueParser.stringify(nodes).trim();
}

/**
 * Splits a value by top-level commas, ignoring commas inside functions,
 * e.g. `opacity 1s, transform cubic-bezier(0, 0, 1, 1)` → 2 items.
 */
export function splitByTopLevelCommas(value: string): string[] {
  const chunks: valueParser.Node[][] = [[]];

  valueParser(value).nodes.forEach(node => {
    if (node.type === 'div' && node.value === ',') {
      chunks.push([]);
    } else {
      chunks[chunks.length - 1].push(node);
    }
  });

  return chunks.map(stringifyNodes);
}

/**
 * Splits a value by top-level whitespace, keeping functions and strings intact,
 * e.g. `1px solid rgb(0, 0, 0)` → ['1px', 'solid', 'rgb(0, 0, 0)'].
 * Top-level dividers (`,`, `/` and `:`) become separate items.
 */
export function splitBySpaces(value: string): string[] {
  return valueParser(value)
    .nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
    .map(node => valueParser.stringify(node));
}

/**
 * Parses a value that consists only of CSS functions,
 * e.g. `translateX(calc(100% - 1px)) rotate(45deg)`.
 * Returns `null` if the value contains anything else.
 */
export function parseFunctionList(value: string): CSSFunction[] | null {
  const functions: CSSFunction[] = [];

  for (const node of valueParser(value).nodes) {
    if (node.type === 'space' || node.type === 'comment') {
      continue;
    }

    if (node.type !== 'function' || !node.value) {
      return null;
    }

    functions.push({
      name: node.value,
      args: splitByTopLevelCommas(valueParser.stringify(node.nodes)),
    });
  }

  return functions;
}

/**
 * Returns true if the value has top-level dividers (`,`, `/` or `:`), e.g. `1px, 2px`.
 */
export function hasTopLevelDivider(value: string) {
  return valueParser(value).nodes.some(node => node.type === 'div');
}

/**
 * Returns true if the value is a single top-level token (no top-level whitespace or dividers).
 */
export function isSingleToken(value: string) {
  const nodes = valueParser(value.trim()).nodes;

  return nodes.length === 1 && nodes[0].type !== 'div';
}

/**
 * Whether the value is balanced (brackets are closed in order, strings are closed), as CSS requires.
 * Tailwind can't parse classes with unbalanced values.
 */
export function isBalancedValue(value: string) {
  const brackets: string[] = [];
  let quote: string | null = null;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '\\') {
      i++;
    } else if (quote) {
      quote = char === quote ? null : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if ('([{'.includes(char)) {
      brackets.push(char);
    } else if (')]}'.includes(char)) {
      if (brackets.pop() !== '([{'[')]}'.indexOf(char)]) {
        return false;
      }
    }
  }

  return !brackets.length && !quote;
}

export function isCSSWideKeyword(value: string) {
  return CSS_WIDE_KEYWORDS.includes(value.trim().toLowerCase());
}

export function isTimeValue(value: string) {
  return TIME_REGEXP.test(value.trim());
}

/** Converts `0.3s` to `300ms` so that equal durations match regardless of the unit. */
export function normalizeTimeValue(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(TIME_REGEXP);

  if (!match || match[2].toLowerCase() !== 's') {
    return trimmed;
  }

  return `${Math.round(parseFloat(trimmed) * 100000) / 100}ms`;
}

/**
 * Escapes a value for an arbitrary value or variant: Tailwind reads `_` as a space and `\_` as `_`,
 * and keeps other backslashes as is. Characters that are whitespace in JavaScript but not in CSS
 * (e.g. a no-break space) would split the class in `@apply`, so they become CSS escapes (`\a0 `).
 */
export function escapeArbitraryValue(value: string) {
  return value.replace(/[_\s]/g, match => {
    if (match === '_') {
      return '\\_';
    }

    return /[ \t\n\r\f]/.test(match)
      ? '_'
      : `\\${match.charCodeAt(0).toString(16)}_`;
  });
}
