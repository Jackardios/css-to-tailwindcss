import type { Config } from 'tailwindcss';
import type {
  KeyValuePair,
  RecursiveKeyValuePair,
  ScreensConfig,
} from 'tailwindcss/types/config';
import type { ConverterMapping } from '../types/ConverterMapping';

import { colord } from 'colord';
import { buildMediaQueryByScreen } from './buildMediaQueryByScreen';
import { flattenObject } from './flattenObject';
import { invertObject } from './invertObject';
import { remValueToPx } from './remValueToPx';
import { normalizeNumberValue } from './normalizeNumberValue';

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
  const flatObject: Record<string, string> = {};

  Object.keys(fontSizes).forEach(key => {
    let value = fontSizes[key];

    if (Array.isArray(value)) {
      value = value[0];
    }

    flatObject[key] = remInPx != null ? remValueToPx(value, remInPx) : value;
  });

  return invertObject(flatObject);
}

function convertScreens(screens: ScreensConfig) {
  const converted: Record<string, string> = {};

  if (Array.isArray(screens)) {
    return converted;
  }

  Object.keys(screens).forEach(key => {
    converted[buildMediaQueryByScreen(screens[key])] = key;
  });

  return converted;
}

function convertColors(colors: RecursiveKeyValuePair) {
  const flatColors = flattenObject(colors);

  const result: Record<string, string> = {};

  Object.keys(flatColors).forEach(colorName => {
    const color = flatColors[colorName]?.toString();

    if (color) {
      const parsed = colord(color);
      result[parsed.isValid() ? parsed.toHex() : color] = colorName;
    }
  });

  return result;
}

function convertSizes(sizes: KeyValuePair, remInPx: number | null | undefined) {
  const result: Record<string, string> = {};

  Object.keys(sizes).forEach(sizeName => {
    const size = sizes[sizeName]?.toString();

    if (size) {
      const convertedSize = normalizeNumberValue(
        remInPx ? remValueToPx(size, remInPx) : size
      );
      result[convertedSize] = sizeName;
    }
  });

  return result;
}

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

    const themeItem = (resolvedTailwindTheme as any)[key];

    if (key === 'fontSize') {
      converterMapping[key] = convertFontSizes(themeItem, remInPx);
    } else if (key === 'screens') {
      converterMapping[key] = convertScreens(themeItem);
    } else if (isColorKey(key)) {
      (converterMapping as any)[key] = convertColors(themeItem);
    } else if (isSizeKey(key)) {
      (converterMapping as any)[key] = convertSizes(themeItem, remInPx);
    } else {
      (converterMapping as any)[key] = invertObject(themeItem);
    }
  });

  return converterMapping;
}
