import { parse, stringify, Selector } from 'css-what';

/**
 * Parses a selector without throwing: css-what rejects selectors it doesn't understand
 * (keyframe selectors like `50%`, nesting selector `&`, preprocessor syntax, etc.).
 */
export function safeParseSelector(rawSelector: string): Selector[][] | null {
  try {
    return parse(rawSelector);
  } catch {
    return null;
  }
}

/**
 * Returns a key that is equal for equivalent spellings of the same selector
 * (whitespace, quotes in attribute selectors, etc.).
 */
export function normalizeSelectorKey(rawSelector: string) {
  const parsed = safeParseSelector(rawSelector);

  if (!parsed) {
    return rawSelector.trim();
  }

  try {
    return stringify(parsed);
  } catch {
    return rawSelector.trim();
  }
}

function collectClassNames(selectors: Selector[][], classNames: Set<string>) {
  selectors.forEach(selector => {
    selector.forEach(item => {
      if (
        item.type === 'attribute' &&
        item.name === 'class' &&
        item.action === 'element'
      ) {
        classNames.add(item.value);
      } else if (item.type === 'pseudo' && Array.isArray(item.data)) {
        collectClassNames(item.data, classNames);
      }
    });
  });
}

const CLASS_NAME_REGEXP = /\.((?:\\.|[^\s.#:[\]>+~(),\\])+)/g;

/**
 * Returns the class names used anywhere in the selector (including `:not()`, `:is()`, etc.).
 */
export function selectorClassNames(rawSelector: string) {
  const classNames = new Set<string>();
  const parsed = safeParseSelector(rawSelector);

  if (parsed) {
    collectClassNames(parsed, classNames);
  } else {
    let match: RegExpExecArray | null;
    while ((match = CLASS_NAME_REGEXP.exec(rawSelector))) {
      classNames.add(match[1].replace(/\\(.)/g, '$1'));
    }
  }

  return classNames;
}

/**
 * Escapes a CSS identifier (https://drafts.csswg.org/cssom/#serialize-an-identifier).
 */
export function escapeIdentifier(value: string) {
  let result = '';

  for (let i = 0; i < value.length; i++) {
    const char = value.charAt(i);
    const code = value.charCodeAt(i);
    const isDigit = code >= 0x30 && code <= 0x39;

    if (code === 0) {
      result += '\uFFFD';
    } else if (
      (code >= 0x01 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && isDigit) ||
      (i === 1 && isDigit && value.charCodeAt(0) === 0x2d)
    ) {
      result += `\\${code.toString(16)} `;
    } else if (i === 0 && value.length === 1 && code === 0x2d) {
      result += `\\${char}`;
    } else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      isDigit ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      result += char;
    } else {
      result += `\\${char}`;
    }
  }

  return result;
}

const COMBINATORS: Record<string, string> = {
  child: '>',
  parent: '<',
  sibling: '~',
  adjacent: '+',
  'column-combinator': '||',
};

function stringifyNamespace(namespace: string | null) {
  if (namespace === null) {
    return '';
  }

  return `${namespace === '*' ? '*' : escapeIdentifier(namespace)}|`;
}

function stringifyToken(token: Selector, index: number) {
  switch (token.type) {
    case 'descendant':
      return ' ';
    case 'child':
    case 'parent':
    case 'sibling':
    case 'adjacent':
    case 'column-combinator':
      return `${index === 0 ? '' : ' '}${COMBINATORS[token.type]} `;
    case 'universal':
      return `${stringifyNamespace(token.namespace)}*`;
    case 'tag':
      return `${stringifyNamespace(token.namespace)}${escapeIdentifier(
        token.name
      )}`;
    case 'attribute':
      if (
        token.name === 'id' &&
        token.action === 'equals' &&
        token.ignoreCase === 'quirks' &&
        !token.namespace
      ) {
        return `#${escapeIdentifier(token.value)}`;
      }

      if (
        token.name === 'class' &&
        token.action === 'element' &&
        token.ignoreCase === 'quirks' &&
        !token.namespace
      ) {
        return `.${escapeIdentifier(token.value)}`;
      }

      // attribute selectors are stringified correctly by css-what
      return stringify([[token]]);
    case 'pseudo':
      return Array.isArray(token.data)
        ? `:${escapeIdentifier(token.name)}(${stringifyTokens(token.data)})`
        : stringify([[token]]);
    default:
      return stringify([[token]]);
  }
}

function stringifyTokens(selectors: Selector[][]): string {
  return selectors
    .map(selector => selector.map(stringifyToken).join(''))
    .join(', ');
}

/**
 * Turns a parsed selector back into a string. Unlike `stringify` from css-what,
 * escapes identifiers properly (e.g. `.w-1\/2`, `.\32xl`).
 * Returns `null` if the result can't be parsed back to the same selector.
 */
export function stringifySelector(selectors: Selector[][]): string | null {
  const result = stringifyTokens(selectors);
  const parsed = safeParseSelector(result);

  return parsed && JSON.stringify(parsed) === JSON.stringify(selectors)
    ? result
    : null;
}
