import type { Config } from 'tailwindcss';
import type {
  KeyValuePair,
  RecursiveKeyValuePair,
  ScreensConfig,
} from 'tailwindcss/types/config';
import type { ConverterMapping } from '../types/ConverterMapping';

import { colord } from 'colord';
import valueParser from 'postcss-value-parser';
import { buildMediaQueryByScreen } from './buildMediaQueryByScreen';
import { flattenObject } from './flattenObject';
import { remValueToPx } from './remValueToPx';
import { normalizeNumbersInString } from './normalizeNumbersInString';
import { removeUnnecessarySpaces } from './removeUnnecessarySpaces';
import { normalizeTimeValue } from './normalizeTimeValue';

function normalizeUnquotedValue(value: string) {
  return removeUnnecessarySpaces(normalizeNumbersInString(value)).replace(
    /[ \t\n\r\f]+/g,
    ' '
  );
}

/**
 * Normalizes numbers and whitespace, keeping strings and URLs as is. Whitespace in URLs is percent-encoded,
 * as browsers do: Tailwind keeps URLs of arbitrary values verbatim, so they can't contain `_` for a space.
 */
export function normalizeValue(value: string) {
  if (!/["']|url\(/i.test(value)) {
    return normalizeUnquotedValue(value);
  }

  let result = '';
  let end = 0;
  valueParser(value).walk(node => {
    const isUrl =
      node.type === 'function' && node.value.toLowerCase() === 'url';

    if (node.type !== 'string' && !isUrl) {
      return;
    }

    const url = isUrl ? node.nodes[0] : null;
    result +=
      normalizeUnquotedValue(value.slice(end, node.sourceIndex)) +
      (url
        ? `${node.value}(${value
            .slice(url.sourceIndex, url.sourceEndIndex)
            .replace(/\s/g, encodeURIComponent)})`
        : value.slice(node.sourceIndex, node.sourceEndIndex));
    end = node.sourceEndIndex;

    return false;
  });

  return result + normalizeUnquotedValue(value.slice(end));
}

export function normalizeColorValue(colorValue: string) {
  const parsed = colord(colorValue);

  return parsed.isValid() ? parsed.toHex() : colorValue;
}

export function normalizeZeroSizeValue(value: string) {
  return value.trim() === '0px' ? '0' : value;
}

export function normalizeSizeValue(
  sizeValue: string,
  remInPx: number | undefined | null
) {
  return normalizeZeroSizeValue(
    normalizeNumbersInString(
      remInPx != null ? remValueToPx(sizeValue, remInPx) : sizeValue
    )
  );
}

export function normalizeAtRuleParams(atRuleParam: string) {
  return removeUnnecessarySpaces(atRuleParam.replace(/\(|\)/g, ''));
}

function mapThemeTokens<V>(
  tokens: KeyValuePair<string, V>,
  valueConverterFn: (tokenValue: V, tokenKey: string) => string | null
) {
  const result: Record<string, string> = {};

  Object.keys(tokens).forEach(tokenKey => {
    const tokenValue = tokens[tokenKey] as V;
    const convertedTokenValue = valueConverterFn(tokenValue, tokenKey);

    if (convertedTokenValue) {
      result[convertedTokenValue] = tokenKey;
    }
  });

  return result;
}

function isColorKey(key: string) {
  return (
    ['fill', 'stroke'].includes(key) || key.toLowerCase().includes('color')
  );
}

function isSizeKey(key: string) {
  return [
    'backdropBlur',
    'backgroundSize',
    'blur',
    'borderRadius',
    'borderSpacing',
    'borderWidth',
    'columns',
    'divideWidth',
    'flexBasis',
    'gap',
    'height',
    'inset',
    'letterSpacing',
    'lineHeight',
    'margin',
    'maxHeight',
    'maxWidth',
    'minHeight',
    'minWidth',
    'outlineOffset',
    'outlineWidth',
    'padding',
    'ringOffsetWidth',
    'ringWidth',
    'scrollMargin',
    'scrollPadding',
    'space',
    'spacing',
    'strokeWidth',
    'textDecorationThickness',
    'textIndent',
    'textUnderlineOffset',
    'translate',
    'width',
  ].includes(key);
}

function convertFontSizes(
  fontSizes: KeyValuePair<
    string,
    | string
    | [fontSize: string, lineHeight: string]
    | [
        fontSize: string,
        configuration: Partial<{
          lineHeight: string;
          letterSpacing: string;
          fontWeight: string | number;
        }>
      ]
  >,
  remInPx?: number | null
) {
  return mapThemeTokens(fontSizes, fontSizeValue => {
    if (!fontSizeValue) {
      return null;
    }

    if (Array.isArray(fontSizeValue)) {
      fontSizeValue = fontSizeValue[0];
    }

    return normalizeSizeValue(fontSizeValue, remInPx);
  });
}

function convertScreens(screens: ScreensConfig) {
  if (Array.isArray(screens)) {
    return {} as Record<string, string>;
  }

  return mapThemeTokens(screens, screenValue => {
    return screenValue
      ? normalizeAtRuleParams(buildMediaQueryByScreen(screenValue))
      : null;
  });
}

function convertColors(colors: RecursiveKeyValuePair) {
  // as in Tailwind, a nested `DEFAULT` color is named after its group (`primary: { DEFAULT }` is `primary`)
  const flatColors: Record<string, any> = {};
  Object.entries(flattenObject(colors)).forEach(([key, value]) => {
    flatColors[key.replace(/-DEFAULT\b/g, '')] = value;
  });

  return mapThemeTokens(flatColors, (colorValue: string) => {
    colorValue = colorValue?.toString();

    return colorValue ? normalizeColorValue(colorValue) : null;
  });
}

function convertSizes(sizes: KeyValuePair, remInPx: number | null | undefined) {
  return mapThemeTokens(sizes, (sizeValue: string) => {
    sizeValue = sizeValue?.toString();

    return sizeValue ? normalizeSizeValue(sizeValue, remInPx) : null;
  });
}

function isTimeKey(key: string) {
  return ['transitionDuration', 'transitionDelay'].includes(key);
}

function convertTimes(times: KeyValuePair) {
  return mapThemeTokens(times, (timeValue: string) => {
    timeValue = timeValue?.toString();

    return timeValue ? normalizeTimeValue(timeValue) : null;
  });
}

function convertOtherThemeTokens(tokens: KeyValuePair | null | undefined) {
  return tokens
    ? mapThemeTokens(tokens, (tokenValue: string) => {
        tokenValue = tokenValue?.toString();

        return tokenValue ? normalizeValue(tokenValue) : null;
      })
    : tokens;
}

const THEME_KEYS_WITHOUT_DEFAULT_UTILITY = [
  // `border` sets the default width, `border-{color}` utilities don't include `DEFAULT`
  'borderColor',
  'divideColor',
  'ringColor',
  'transitionDuration',
  'transitionTimingFunction',
];

export function converterMappingByTailwindTheme(
  resolvedTailwindTheme: Config['theme'],
  remInPx?: number | null
) {
  const converterMapping = {} as ConverterMapping;

  if (!resolvedTailwindTheme) {
    return converterMapping;
  }

  Object.keys(resolvedTailwindTheme as any).forEach(key => {
    if (['keyframes', 'container', 'fontFamily'].includes(key)) {
      return;
    }

    let themeItem = (resolvedTailwindTheme as any)[key];

    if (THEME_KEYS_WITHOUT_DEFAULT_UTILITY.includes(key) && themeItem) {
      // Tailwind doesn't generate a utility for the `DEFAULT` value of these keys
      themeItem = { ...themeItem };
      delete themeItem.DEFAULT;
    }

    if (key === 'fontSize') {
      converterMapping[key] = convertFontSizes(themeItem, remInPx);
    } else if (key === 'screens') {
      converterMapping[key] = convertScreens(themeItem);
    } else if (isColorKey(key)) {
      (converterMapping as any)[key] = convertColors(themeItem);
    } else if (isTimeKey(key)) {
      (converterMapping as any)[key] = convertTimes(themeItem);
    } else if (isSizeKey(key)) {
      (converterMapping as any)[key] = convertSizes(themeItem, remInPx);
    } else {
      (converterMapping as any)[key] = convertOtherThemeTokens(themeItem);
    }
  });

  return converterMapping;
}
