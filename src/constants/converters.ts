import type { Declaration } from 'postcss';
import type { ResolvedTailwindConverterConfig } from '../TailwindConverter';

import { UTILITIES_MAPPING } from './utilities-mapping';
import {
  normalizeColorValue,
  normalizeSizeValue,
  normalizeValue,
} from '../utils/converterMappingByTailwindTheme';
import { parseCSSFunctions } from '../utils/parseCSSFunctions';
import { removeUnnecessarySpaces } from '../utils/removeUnnecessarySpaces';
import { isCSSVariable } from '../utils/isCSSVariable';

function prepareArbitraryValue(value: string) {
  return normalizeValue(value).replace(/_/g, '\\_').replace(/\s+/g, '_');
}

type CSSDataType =
  | 'color'
  | 'length'
  | 'number'
  | 'image'
  | 'position'
  | 'family-name';

export function convertDeclarationValue(
  value: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  fallbackValue = value,
  fallbackClassPrefix = classPrefix,
  cssDataType: CSSDataType | null = null
) {
  const normalizedValue = normalizeValue(value);
  const mappedValue = valuesMap[normalizedValue];
  if (mappedValue) {
    if (mappedValue === 'DEFAULT') {
      return [classPrefix];
    }

    return [`${classPrefix}-${mappedValue}`];
  }

  const arbitraryValue = prepareArbitraryValue(fallbackValue);

  if (!arbitraryValue) {
    return [];
  }

  if (cssDataType && isCSSVariable(arbitraryValue)) {
    return [
      `${fallbackClassPrefix}-[${
        cssDataType ? `${cssDataType}:` : ''
      }${arbitraryValue}]`,
    ];
  }

  return [`${fallbackClassPrefix}-[${arbitraryValue}]`];
}

export function strictConvertDeclarationValue(
  value: string,
  valuesMap: Record<string, string>
) {
  return valuesMap[value] ? [valuesMap[value]] : [];
}

function convertColorDeclarationValue(
  declValue: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  cssDataType: CSSDataType | null = null
) {
  return convertDeclarationValue(
    normalizeColorValue(declValue),
    valuesMap,
    classPrefix,
    declValue,
    classPrefix,
    cssDataType
  );
}

function convertSizeDeclarationValue(
  declValue: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  remInPx: number | null | undefined,
  supportsNegativeValues = false,
  cssDataType: CSSDataType | null = null
) {
  const normalizedValue = normalizeSizeValue(declValue, remInPx);
  const isNegativeValue =
    supportsNegativeValues && normalizedValue.startsWith('-');

  return convertDeclarationValue(
    isNegativeValue ? normalizedValue.substring(1) : normalizedValue,
    valuesMap,
    isNegativeValue ? `-${classPrefix}` : classPrefix,
    declValue,
    classPrefix,
    cssDataType
  );
}

function convertBorderDeclarationValue(
  value: string,
  config: ResolvedTailwindConverterConfig,
  classPrefix: string
) {
  const [width, style, ...colorArray] = value.split(/\s+/m);
  const color = colorArray.join(' ');

  let classes: string[] = [];

  if (width) {
    classes = classes.concat(
      convertSizeDeclarationValue(
        width,
        config.mapping.borderWidth,
        classPrefix,
        config.remInPx,
        false,
        'length'
      )
    );
  }

  if (style) {
    classes = classes.concat(
      strictConvertDeclarationValue(style, UTILITIES_MAPPING['border-style'])
    );
  }

  if (color) {
    classes = classes.concat(
      convertColorDeclarationValue(
        color,
        config.mapping.borderColor,
        classPrefix,
        'color'
      )
    );
  }

  return classes;
}

function parseComposedSpacingValue(value: string) {
  const values = value.split(/\s+/m);

  if (values.length > 4) {
    return { top: null, right: null, bottom: null, left: null };
  }

  return {
    top: values[0],
    right: values[1] || values[0],
    bottom: values[2] || values[0],
    left: values[3] || values[1] || values[0],
  };
}

export function convertComposedSpacingDeclarationValue(
  value: string,
  mapping: {
    top: { valuesMapping: Record<string, string>; classPrefix: string };
    right: { valuesMapping: Record<string, string>; classPrefix: string };
    bottom: { valuesMapping: Record<string, string>; classPrefix: string };
    left: { valuesMapping: Record<string, string>; classPrefix: string };
  },
  remInPx: number | null | undefined
) {
  const parsed = parseComposedSpacingValue(value);
  let classes: string[] = [];

  (Object.keys(parsed) as ['top', 'right', 'bottom', 'left']).forEach(key => {
    const value = parsed[key];
    const { valuesMapping, classPrefix } = mapping[key] || {};

    if (value && valuesMapping && classPrefix) {
      classes = classes.concat(
        convertSizeDeclarationValue(
          value,
          valuesMapping,
          classPrefix,
          remInPx,
          true
        )
      );
    }
  });

  return classes;
}

interface TailwindDeclarationConverters {
  [property: string]: (
    declaration: Declaration,
    config: ResolvedTailwindConverterConfig
  ) => string[];
}

export const TAILWIND_DECLARATION_CONVERTERS: TailwindDeclarationConverters = {
  'accent-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.accentColor,
      'accent',
      'color'
    ),

  'align-content': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['align-content']
    ),

  'align-items': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['align-items']
    ),

  'align-self': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['align-self']
    ),

  animation: (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.animation,
      'animate'
    ),

  appearance: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['appearance']
    ),

  'aspect-ratio': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.aspectRatio,
      'aspect'
    ),

  'backdrop-filter': (declaration, config) => {
    let classes: string[] = [];
    const mappings: Record<string, any> = {
      blur: config.mapping.backdropBlur,
      brightness: config.mapping.backdropBrightness,
      contrast: config.mapping.backdropContrast,
      grayscale: config.mapping.backdropGrayscale,
      'hue-rotate': config.mapping.backdropHueRotate,
      invert: config.mapping.backdropInvert,
      opacity: config.mapping.backdropOpacity,
      saturate: config.mapping.backdropSaturate,
      sepia: config.mapping.backdropSepia,
    };

    parseCSSFunctions(declaration.value).every(({ name, value }) => {
      if (name == null || value == null) {
        classes = [];
        return false;
      }

      const mapping = mappings[name];

      if (mapping) {
        delete mappings[name];

        const currentClasses = convertSizeDeclarationValue(
          value,
          mapping,
          `backdrop-${name}`,
          config.remInPx,
          name === 'hue-rotate'
        );

        if (currentClasses?.length) {
          classes = classes.concat(currentClasses);
          return true;
        }
      }

      classes = [];
      return false;
    });

    return classes;
  },

  'background-attachment': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['background-attachment']
    ),

  'background-blend-mode': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['background-blend-mode']
    ),

  'background-clip': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['background-clip']
    ),

  'background-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.backgroundColor,
      'bg',
      'color'
    ),

  'background-image': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.backgroundImage,
      'bg',
      declaration.value,
      'bg',
      'image'
    ),

  'background-origin': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['background-origin']
    ),

  'background-position': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.backgroundPosition,
      'bg',
      declaration.value,
      'bg',
      'position'
    ),

  'background-repeat': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['background-repeat']
    ),

  'background-size': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.backgroundSize,
      'bg',
      config.remInPx,
      false,
      'length'
    ),

  border: (declaration, config) =>
    convertBorderDeclarationValue(declaration.value, config, 'border'),

  'border-bottom': (declaration, config) =>
    convertBorderDeclarationValue(declaration.value, config, 'border-b'),

  'border-bottom-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.borderColor,
      'border-b',
      'color'
    ),

  'border-bottom-left-radius': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderRadius,
      'rounded-bl',
      config.remInPx
    ),

  'border-bottom-right-radius': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderRadius,
      'rounded-br',
      config.remInPx
    ),

  // 'border-bottom-style': declaration =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-bottom-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderWidth,
      'border-b',
      config.remInPx,
      false,
      'length'
    ),

  'border-collapse': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['border-collapse']
    ),

  'border-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.borderColor,
      'border',
      'color'
    ),

  'border-left': (declaration, config) =>
    convertBorderDeclarationValue(declaration.value, config, 'border-l'),

  'border-left-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.borderColor,
      'border-l',
      'color'
    ),

  // 'border-left-style': declaration =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-left-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderWidth,
      'border-l',
      config.remInPx,
      false,
      'length'
    ),

  'border-radius': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderRadius,
      'rounded',
      config.remInPx
    ),

  'border-right': (declaration, config) =>
    convertBorderDeclarationValue(declaration.value, config, 'border-r'),

  'border-right-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.borderColor,
      'border-r',
      'color'
    ),

  // 'border-right-style': declaration =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-right-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderWidth,
      'border-r',
      config.remInPx,
      false,
      'length'
    ),

  'border-spacing': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderSpacing,
      'border-spacing',
      config.remInPx
    ),

  'border-style': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['border-style']
    ),

  'border-top': (declaration, config) =>
    convertBorderDeclarationValue(declaration.value, config, 'border-t'),

  'border-top-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.borderColor,
      'border-t',
      'color'
    ),

  'border-top-left-radius': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderRadius,
      'rounded-tl',
      config.remInPx
    ),

  'border-top-right-radius': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderRadius,
      'rounded-tr',
      config.remInPx
    ),

  // 'border-top-style': declaration =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-top-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderWidth,
      'border-t',
      config.remInPx,
      false,
      'length'
    ),

  'border-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.borderWidth,
      'border',
      config.remInPx,
      false,
      'length'
    ),

  bottom: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.inset,
      'bottom',
      config.remInPx,
      true
    ),

  'box-decoration-break': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['box-decoration-break']
    ),

  'box-shadow': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.boxShadow,
      'shadow'
    ),

  'box-sizing': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['box-sizing']
    ),

  'break-after': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['break-after']
    ),

  'break-before': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['break-before']
    ),

  'break-inside': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['break-inside']
    ),

  'caret-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.caretColor,
      'caret',
      'color'
    ),

  clear: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['clear']
    ),

  color: (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.textColor,
      'text',
      'color'
    ),

  'column-gap': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.gap,
      'gap-x',
      config.remInPx
    ),

  columns: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.columns,
      'columns',
      config.remInPx
    ),

  content: (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.content,
      'content'
    ),

  cursor: (declaration, config) =>
    convertDeclarationValue(declaration.value, config.mapping.cursor, 'cursor'),

  display: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['display']
    ),

  fill: (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.fill,
      'fill'
    ),

  filter: (declaration, config) => {
    let classes: string[] = [];
    const mappings: Record<string, any> = {
      blur: config.mapping.blur,
      brightness: config.mapping.brightness,
      contrast: config.mapping.contrast,
      grayscale: config.mapping.grayscale,
      'hue-rotate': config.mapping.hueRotate,
      invert: config.mapping.invert,
      opacity: config.mapping.opacity,
      saturate: config.mapping.saturate,
      sepia: config.mapping.sepia,
      // 'drop-shadow': config.mapping.dropShadow,
    };

    parseCSSFunctions(declaration.value).every(({ name, value }) => {
      if (name == null || value == null) {
        classes = [];
        return false;
      }

      const mapping = mappings[name];

      if (mapping) {
        delete mapping[name];

        const currentClasses = convertSizeDeclarationValue(
          value,
          mapping,
          name,
          config.remInPx,
          name === 'hue-rotate'
        );

        if (currentClasses?.length) {
          classes = classes.concat(currentClasses);
          return true;
        }
      }

      classes = [];
      return false;
    });

    return classes;
  },

  flex: (declaration, config) =>
    convertDeclarationValue(declaration.value, config.mapping.flex, 'flex'),

  'flex-basis': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.flexBasis,
      'basis',
      config.remInPx
    ),

  'flex-direction': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['flex-direction']
    ),

  'flex-grow': (declaration, config) =>
    convertDeclarationValue(declaration.value, config.mapping.flexGrow, 'grow'),

  'flex-shrink': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.flexShrink,
      'shrink'
    ),

  'flex-wrap': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['flex-wrap']
    ),

  float: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['float']
    ),

  'font-size': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.fontSize,
      'text',
      config.remInPx,
      false,
      'length'
    ),

  'font-smoothing': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['font-smoothing']
    ),

  'font-style': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['font-style']
    ),

  'font-variant-numeric': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['font-variant-numeric']
    ),

  'font-weight': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.fontWeight,
      'font',
      declaration.value,
      'font',
      'number'
    ),

  gap: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.gap,
      'gap',
      config.remInPx
    ),

  'grid-auto-columns': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridAutoColumns,
      'auto-cols'
    ),

  'grid-auto-flow': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['grid-auto-flow']
    ),

  'grid-auto-rows': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridAutoRows,
      'auto-rows'
    ),

  'grid-column': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridColumn,
      'col'
    ),

  'grid-column-end': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridColumnEnd,
      'col-end'
    ),

  'grid-column-gap': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.gap,
      'gap-x',
      config.remInPx
    ),

  'grid-column-start': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridColumnStart,
      'col-start'
    ),

  'grid-gap': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.gap,
      'gap',
      config.remInPx
    ),

  'grid-row': (declaration, config) =>
    convertDeclarationValue(declaration.value, config.mapping.gridRow, 'row'),

  'grid-row-end': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridRowEnd,
      'row-end'
    ),

  'grid-row-gap': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.gap,
      'gap-y',
      config.remInPx
    ),

  'grid-row-start': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridRowStart,
      'row-start'
    ),

  'grid-template-columns': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridTemplateColumns,
      'grid-cols'
    ),

  'grid-template-rows': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.gridTemplateRows,
      'grid-rows'
    ),

  height: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.height,
      'h',
      config.remInPx
    ),

  inset: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.inset,
      'inset',
      config.remInPx,
      true
    ),

  isolation: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['isolation']
    ),

  'justify-content': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['justify-content']
    ),

  'justify-items': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['justify-items']
    ),

  'justify-self': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['justify-self']
    ),

  left: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.inset,
      'left',
      config.remInPx,
      true
    ),

  'letter-spacing': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.letterSpacing,
      'tracking',
      config.remInPx,
      true
    ),

  'line-height': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.lineHeight,
      'leading',
      config.remInPx
    ),

  'list-style-position': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['list-style-position']
    ),

  'list-style-type': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.listStyleType,
      'list'
    ),

  margin: (declaration, config) =>
    convertComposedSpacingDeclarationValue(
      declaration.value,
      {
        top: { valuesMapping: config.mapping.margin, classPrefix: 'mt' },
        right: { valuesMapping: config.mapping.margin, classPrefix: 'mr' },
        bottom: { valuesMapping: config.mapping.margin, classPrefix: 'mb' },
        left: { valuesMapping: config.mapping.margin, classPrefix: 'ml' },
      },
      config.remInPx
    ),

  'margin-bottom': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.margin,
      'mb',
      config.remInPx,
      true
    ),

  'margin-left': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.margin,
      'ml',
      config.remInPx,
      true
    ),

  'margin-right': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.margin,
      'mr',
      config.remInPx,
      true
    ),

  'margin-top': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.margin,
      'mt',
      config.remInPx,
      true
    ),

  'max-height': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.maxHeight,
      'max-h',
      config.remInPx
    ),

  'max-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.maxWidth,
      'max-w',
      config.remInPx
    ),

  'min-height': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.minHeight,
      'min-h',
      config.remInPx
    ),

  'min-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.minWidth,
      'min-w',
      config.remInPx
    ),

  'mix-blend-mode': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['mix-blend-mode']
    ),

  'object-fit': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['object-fit']
    ),

  'object-position': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.objectPosition,
      'object'
    ),

  opacity: (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.opacity,
      'opacity'
    ),

  order: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.order,
      'order',
      null,
      true
    ),

  outline: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['outline']
    ),

  'outline-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.outlineColor,
      'outline',
      'color'
    ),

  'outline-offset': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.outlineOffset,
      'outline-offset',
      config.remInPx,
      true,
      'length'
    ),

  'outline-style': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['outline-style']
    ),

  'outline-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.outlineWidth,
      'outline',
      config.remInPx,
      false,
      'length'
    ),

  overflow: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['overflow']
    ),

  'overflow-wrap': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['overflow-wrap']
    ),

  'overflow-x': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['overflow-x']
    ),

  'overflow-y': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['overflow-y']
    ),

  'overscroll-behavior': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['overscroll-behavior']
    ),
  'overscroll-behavior-x': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['overscroll-behavior-x']
    ),
  'overscroll-behavior-y': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['overscroll-behavior-y']
    ),

  padding: (declaration, config) =>
    convertComposedSpacingDeclarationValue(
      declaration.value,
      {
        top: { valuesMapping: config.mapping.padding, classPrefix: 'pt' },
        right: { valuesMapping: config.mapping.padding, classPrefix: 'pr' },
        bottom: { valuesMapping: config.mapping.padding, classPrefix: 'pb' },
        left: { valuesMapping: config.mapping.padding, classPrefix: 'pl' },
      },
      config.remInPx
    ),

  'padding-bottom': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.padding,
      'pb',
      config.remInPx
    ),

  'padding-left': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.padding,
      'pl',
      config.remInPx
    ),

  'padding-right': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.padding,
      'pr',
      config.remInPx
    ),

  'padding-top': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.padding,
      'pt',
      config.remInPx
    ),

  'page-break-after': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['break-after']
    ),

  'page-break-before': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['break-before']
    ),

  'page-break-inside': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['break-inside']
    ),

  'place-content': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['place-content']
    ),

  'place-items': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['place-items']
    ),

  'place-self': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['place-self']
    ),

  'pointer-events': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['pointer-events']
    ),

  position: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['position']
    ),

  resize: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['resize']
    ),

  right: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.inset,
      'right',
      config.remInPx,
      true
    ),

  'row-gap': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.gap,
      'gap-y',
      config.remInPx
    ),

  'scroll-behavior': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['scroll-behavior']
    ),

  'scroll-margin': (declaration, config) =>
    convertComposedSpacingDeclarationValue(
      declaration.value,
      {
        top: {
          valuesMapping: config.mapping.scrollMargin,
          classPrefix: 'scroll-mt',
        },
        right: {
          valuesMapping: config.mapping.scrollMargin,
          classPrefix: 'scroll-mr',
        },
        bottom: {
          valuesMapping: config.mapping.scrollMargin,
          classPrefix: 'scroll-mb',
        },
        left: {
          valuesMapping: config.mapping.scrollMargin,
          classPrefix: 'scroll-ml',
        },
      },
      config.remInPx
    ),

  'scroll-margin-bottom': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollMargin,
      'scroll-mb',
      config.remInPx,
      true
    ),

  'scroll-margin-left': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollMargin,
      'scroll-ml',
      config.remInPx,
      true
    ),

  'scroll-margin-right': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollMargin,
      'scroll-mr',
      config.remInPx,
      true
    ),

  'scroll-margin-top': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollMargin,
      'scroll-mt',
      config.remInPx,
      true
    ),

  'scroll-padding': (declaration, config) =>
    convertComposedSpacingDeclarationValue(
      declaration.value,
      {
        top: {
          valuesMapping: config.mapping.scrollPadding,
          classPrefix: 'scroll-pt',
        },
        right: {
          valuesMapping: config.mapping.scrollPadding,
          classPrefix: 'scroll-pr',
        },
        bottom: {
          valuesMapping: config.mapping.scrollPadding,
          classPrefix: 'scroll-pb',
        },
        left: {
          valuesMapping: config.mapping.scrollPadding,
          classPrefix: 'scroll-pl',
        },
      },
      config.remInPx
    ),

  'scroll-padding-bottom': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollPadding,
      'scroll-pb',
      config.remInPx
    ),

  'scroll-padding-left': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollPadding,
      'scroll-pl',
      config.remInPx
    ),

  'scroll-padding-right': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollPadding,
      'scroll-pr',
      config.remInPx
    ),

  'scroll-padding-top': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.scrollPadding,
      'scroll-pt',
      config.remInPx
    ),

  'scroll-snap-align': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['scroll-snap-align']
    ),
  'scroll-snap-type': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['scroll-snap-type']
    ),

  'scroll-snap-stop': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['scroll-snap-stop']
    ),

  stroke: (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.stroke,
      'stroke',
      'color'
    ),

  'stroke-width': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.strokeWidth,
      'stroke',
      config.remInPx,
      false,
      'length'
    ),

  'table-layout': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['table-layout']
    ),

  'text-align': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['text-align']
    ),

  'text-decoration': declaration => {
    const parsed = declaration.value.trim().split(/\s+/m);
    return parsed.length === 1
      ? strictConvertDeclarationValue(
          parsed[0],
          UTILITIES_MAPPING['text-decoration-line']
        )
      : [];
  },

  'text-decoration-color': (declaration, config) =>
    convertColorDeclarationValue(
      declaration.value,
      config.mapping.textDecorationColor,
      'decoration',
      'color'
    ),

  'text-decoration-line': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['text-decoration-line']
    ),

  'text-decoration-style': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['text-decoration-style']
    ),

  'text-decoration-thickness': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.textDecorationThickness,
      'decoration',
      config.remInPx,
      false,
      'length'
    ),

  'text-indent': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.textIndent,
      'indent',
      config.remInPx,
      true
    ),

  'text-overflow': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['text-overflow']
    ),

  'text-transform': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['text-transform']
    ),

  'text-underline-offset': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.textUnderlineOffset,
      'underline-offset',
      config.remInPx,
      false,
      'length'
    ),

  top: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.inset,
      'top',
      config.remInPx,
      true
    ),

  'touch-action': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['touch-action']
    ),

  transform: (declaration, config) => {
    let classes: string[] = [];

    parseCSSFunctions(declaration.value).every(({ name, value }) => {
      if (name == null || value == null) {
        classes = [];
        return false;
      }

      let currentClasses: string[] = [];
      const values = value.split(/,\s/m).map(v => v.trim());

      if (name === 'translate') {
        if (values[0]) {
          currentClasses = currentClasses.concat(
            convertSizeDeclarationValue(
              values[0],
              config.mapping.translate,
              'translate-x',
              config.remInPx,
              true
            )
          );
        }
        if (values[1]) {
          currentClasses = currentClasses.concat(
            convertSizeDeclarationValue(
              values[1],
              config.mapping.translate,
              'translate-y',
              config.remInPx,
              true
            )
          );
        }
      } else if (name === 'translateX') {
        currentClasses = currentClasses.concat(
          convertSizeDeclarationValue(
            value,
            config.mapping.translate,
            'translate-x',
            config.remInPx,
            true
          )
        );
      } else if (name === 'translateY') {
        currentClasses = currentClasses.concat(
          convertSizeDeclarationValue(
            value,
            config.mapping.translate,
            'translate-y',
            config.remInPx,
            true
          )
        );
      } else if (name === 'scale') {
        if (values[0]) {
          currentClasses = currentClasses.concat(
            convertSizeDeclarationValue(
              values[0],
              config.mapping.scale,
              'scale-x',
              config.remInPx,
              true
            )
          );
          currentClasses = currentClasses.concat(
            convertSizeDeclarationValue(
              values[1] || values[0],
              config.mapping.scale,
              'scale-y',
              config.remInPx,
              true
            )
          );
        }
      } else if (name === 'scaleX') {
        currentClasses = currentClasses.concat(
          convertSizeDeclarationValue(
            value,
            config.mapping.scale,
            'scale-x',
            config.remInPx,
            true
          )
        );
      } else if (name === 'scaleY') {
        currentClasses = currentClasses.concat(
          convertSizeDeclarationValue(
            value,
            config.mapping.scale,
            'scale-y',
            config.remInPx,
            true
          )
        );
      } else if (name === 'skew') {
        if (values[0]) {
          currentClasses = currentClasses.concat(
            convertSizeDeclarationValue(
              values[0],
              config.mapping.skew,
              'skew-x',
              config.remInPx,
              true
            )
          );
        }
        if (values[1]) {
          currentClasses = currentClasses.concat(
            convertSizeDeclarationValue(
              values[1],
              config.mapping.skew,
              'skew-y',
              config.remInPx,
              true
            )
          );
        }
      } else if (name === 'skewX') {
        currentClasses = currentClasses.concat(
          convertSizeDeclarationValue(
            value,
            config.mapping.skew,
            'skew-x',
            config.remInPx,
            true
          )
        );
      } else if (name === 'skewY') {
        currentClasses = currentClasses.concat(
          convertSizeDeclarationValue(
            value,
            config.mapping.skew,
            'skew-y',
            config.remInPx,
            true
          )
        );
      } else if (name === 'rotate') {
        currentClasses = currentClasses.concat(
          convertSizeDeclarationValue(
            value,
            config.mapping.rotate,
            'rotate',
            config.remInPx,
            true
          )
        );
      }

      if (currentClasses.length) {
        classes = classes.concat(currentClasses);
        return true;
      }

      classes = [];
      return false;
    });

    return classes;
  },

  'transform-origin': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.transformOrigin,
      'origin'
    ),

  transition: (declaration, config) => {
    let classes: string[] = [];

    const parsed = removeUnnecessarySpaces(declaration.value.trim())
      .split(/\s+/m)
      .map(v => v.trim());

    if (parsed.length > 4) {
      return [];
    }

    if (parsed[0]) {
      classes = classes.concat(
        convertDeclarationValue(
          parsed[0],
          config.mapping.transitionProperty,
          'transition'
        )
      );
    }

    if (parsed[1]) {
      classes = classes.concat(
        convertDeclarationValue(
          parsed[1],
          config.mapping.transitionDuration,
          'duration'
        )
      );
    }

    if (parsed[2]) {
      const isTimingFunction = isNaN(parseFloat(parsed[2]));

      if (isTimingFunction) {
        classes = classes.concat(
          convertDeclarationValue(
            parsed[2],
            config.mapping.transitionTimingFunction,
            'ease'
          )
        );
      } else {
        classes = classes.concat(
          convertDeclarationValue(
            parsed[2],
            config.mapping.transitionDelay,
            'delay'
          )
        );
      }
    }

    if (parsed[3]) {
      classes = classes.concat(
        convertDeclarationValue(
          parsed[3],
          config.mapping.transitionDelay,
          'delay'
        )
      );
    }

    return classes;
  },

  'transition-delay': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.transitionDelay,
      'delay'
    ),

  'transition-duration': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.transitionDuration,
      'duration'
    ),

  'transition-property': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.transitionProperty,
      'transition'
    ),

  'transition-timing-function': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.transitionTimingFunction,
      'ease'
    ),

  'user-select': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['user-select']
    ),

  'vertical-align': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['vertical-align']
    ),

  visibility: declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['visibility']
    ),

  'white-space': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['white-space']
    ),

  width: (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.width,
      'w',
      config.remInPx
    ),

  'will-change': (declaration, config) =>
    convertDeclarationValue(
      declaration.value,
      config.mapping.willChange,
      'will-change'
    ),

  'word-break': declaration =>
    strictConvertDeclarationValue(
      declaration.value,
      UTILITIES_MAPPING['word-break']
    ),

  'z-index': (declaration, config) =>
    convertSizeDeclarationValue(
      declaration.value,
      config.mapping.zIndex,
      'z',
      null,
      true
    ),
};
