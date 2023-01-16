import type { Declaration } from 'postcss';
import type { ResolvedTailwindConverterConfig } from '../TailwindConverter';

import { UTILITIES_MAPPING } from './utilities-mapping';
import {
  normalizeColorValue,
  normalizeSizeValue,
  normalizeValue,
} from '../utils/converterMappingByTailwindTheme';
import { everyCSSFunction } from '../utils/everyCSSFunction';

function prepareArbitraryValue(value: string) {
  return normalizeValue(value).replace(/_/g, '\\_').replace(/\s+/g, '_');
}

export function convertDeclarationValue(
  value: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  fallbackValue = value,
  fallbackClassPrefix = classPrefix
) {
  if (valuesMap[value]) {
    if (valuesMap[value] === 'DEFAULT') {
      return [classPrefix];
    }

    return [`${classPrefix}-${valuesMap[value]}`];
  }

  return [`${fallbackClassPrefix}-[${prepareArbitraryValue(fallbackValue)}]`];
}

function convertDeclaration(
  declaration: Declaration,
  valuesMap: Record<string, string>,
  classPrefix: string
) {
  return convertDeclarationValue(declaration.value, valuesMap, classPrefix);
}

export function strictConvertDeclarationValue(
  value: string,
  valuesMap: Record<string, string>
) {
  return valuesMap[value] ? [valuesMap[value]] : [];
}

function strictConvertDeclaration(
  declaration: Declaration,
  valuesMap: Record<string, string>
) {
  return strictConvertDeclarationValue(declaration.value, valuesMap);
}

function convertColorDeclarationValue(
  declValue: string,
  valuesMap: Record<string, string>,
  classPrefix: string
) {
  return convertDeclarationValue(
    normalizeColorValue(declValue),
    valuesMap,
    classPrefix,
    declValue
  );
}

function convertColorDeclaration(
  declaration: Declaration,
  valuesMap: Record<string, string>,
  classPrefix: string
) {
  return convertColorDeclarationValue(
    declaration.value,
    valuesMap,
    classPrefix
  );
}

function convertSizeDeclarationValue(
  declValue: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  remInPx: number | null | undefined,
  supportsNegativeValues = false
) {
  const normalizedValue = normalizeSizeValue(declValue, remInPx);
  const isNegativeValue =
    supportsNegativeValues && normalizedValue.startsWith('-');

  return convertDeclarationValue(
    isNegativeValue ? normalizedValue.substring(1) : normalizedValue,
    valuesMap,
    isNegativeValue ? `-${classPrefix}` : classPrefix,
    declValue,
    classPrefix
  );
}

function convertSizeDeclaration(
  declaration: Declaration,
  valuesMap: Record<string, string>,
  classPrefix: string,
  remInPx: number | null | undefined,
  supportsNegativeValues = false
) {
  return convertSizeDeclarationValue(
    declaration.value,
    valuesMap,
    classPrefix,
    remInPx,
    supportsNegativeValues
  );
}

function convertBorderDeclaration(
  declaration: Declaration,
  config: ResolvedTailwindConverterConfig,
  classPrefix: string
) {
  const [width, style, ...colorArray] = declaration.value.split(/\s+/);
  const color = colorArray.join(' ');

  let classes: string[] = [];

  if (width) {
    classes = classes.concat(
      convertSizeDeclarationValue(
        width,
        config.mapping.borderWidth,
        classPrefix,
        config.remInPx
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
        classPrefix
      )
    );
  }

  return classes;
}

function parseComposedSpacingValue(value: string) {
  const values = value.split(/\s+/);

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
    convertColorDeclaration(declaration, config.mapping.accentColor, 'accent'),

  'align-content': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['align-content']),

  'align-items': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['align-items']),

  'align-self': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['align-self']),

  animation: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.animation, 'animate'),

  appearance: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['appearance']),

  'aspect-ratio': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.aspectRatio, 'aspect'),

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

    everyCSSFunction(declaration.value, ({ name, value }) => {
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
          config.remInPx
        );

        if (currentClasses?.length) {
          classes = classes.concat(currentClasses);
          return true;
        }
      }

      return false;
    });

    return classes;
  },

  'background-attachment': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['background-attachment']
    ),

  'background-blend-mode': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['background-blend-mode']
    ),

  'background-clip': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['background-clip']),

  'background-color': (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.backgroundColor, 'bg'),

  'background-image': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.backgroundImage, 'bg'),

  'background-origin': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['background-origin']
    ),

  'background-position': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.backgroundPosition, 'bg'),

  'background-repeat': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['background-repeat']
    ),

  'background-size': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.backgroundSize,
      'bg',
      config.remInPx
    ),

  border: (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border'),

  'border-bottom': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-b'),

  'border-bottom-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-b'
    ),

  'border-bottom-left-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-bl',
      config.remInPx
    ),

  'border-bottom-right-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-br',
      config.remInPx
    ),

  // 'border-bottom-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-bottom-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-b',
      config.remInPx
    ),

  'border-collapse': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-collapse']),

  'border-color': (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.borderColor, 'border'),

  'border-left': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-l'),

  'border-left-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-l'
    ),

  // 'border-left-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-left-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-l',
      config.remInPx
    ),

  'border-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded',
      config.remInPx
    ),

  'border-right': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-r'),

  'border-right-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-r'
    ),

  // 'border-right-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-right-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-r',
      config.remInPx
    ),

  'border-spacing': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderSpacing,
      'border-spacing',
      config.remInPx
    ),

  'border-style': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-top': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-t'),

  'border-top-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-t'
    ),

  'border-top-left-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-tl',
      config.remInPx
    ),

  'border-top-right-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-tr',
      config.remInPx
    ),

  // 'border-top-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-top-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-t',
      config.remInPx
    ),

  'border-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border',
      config.remInPx
    ),

  bottom: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.inset,
      'bottom',
      config.remInPx,
      true
    ),

  'box-decoration-break': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['box-decoration-break']
    ),

  'box-shadow': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.boxShadow, 'shadow'),

  'box-sizing': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['box-sizing']),

  'break-after': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-after']),

  'break-before': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-before']),

  'break-inside': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-inside']),

  'caret-color': (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.caretColor, 'caret'),

  clear: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['clear']),

  color: (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.textColor, 'text'),

  'column-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-x',
      config.remInPx
    ),

  columns: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.columns,
      'columns',
      config.remInPx
    ),

  content: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.content, 'content'),

  cursor: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.cursor, 'cursor'),

  display: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['display']),

  fill: (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.fill, 'fill'),

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

    everyCSSFunction(declaration.value, ({ name, value }) => {
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
          config.remInPx
        );

        if (currentClasses?.length) {
          classes = classes.concat(currentClasses);
          return true;
        }
      }

      return false;
    });

    return classes;
  },

  flex: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.flex, 'flex'),

  'flex-basis': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.flexBasis,
      'basis',
      config.remInPx
    ),

  'flex-direction': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['flex-direction']),

  'flex-flow': (declaration, config) => {
    // TODO: parse flex-flow
    return [];
  },

  'flex-grow': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.flexGrow, 'grow'),

  'flex-shrink': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.flexShrink, 'shrink'),

  'flex-wrap': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['flex-wrap']),

  float: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['float']),

  'font-size': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.fontSize,
      'text',
      config.remInPx
    ),

  'font-smoothing': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['font-smoothing']),

  'font-style': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['font-style']),

  'font-variant-numeric': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['font-variant-numeric']
    ),

  'font-weight': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.fontWeight, 'font'),

  gap: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap',
      config.remInPx
    ),

  grid: (declaration, config) => {
    // TODO: parse grid
    return [];
  },

  'grid-auto-columns': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.gridAutoColumns,
      'auto-cols'
    ),

  'grid-auto-flow': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['grid-auto-flow']),

  'grid-auto-rows': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridAutoRows, 'auto-rows'),

  'grid-column': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridColumn, 'col'),

  'grid-column-end': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridColumnEnd, 'col-end'),

  'grid-column-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-x',
      config.remInPx
    ),

  'grid-column-start': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.gridColumnStart,
      'col-start'
    ),

  'grid-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap',
      config.remInPx
    ),

  'grid-row': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridRow, 'row'),

  'grid-row-end': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridRowEnd, 'row-end'),

  'grid-row-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-y',
      config.remInPx
    ),

  'grid-row-start': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridRowStart, 'row-start'),

  'grid-template-columns': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.gridTemplateColumns,
      'grid-cols'
    ),

  'grid-template-rows': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.gridTemplateRows,
      'grid-rows'
    ),

  height: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.height,
      'h',
      config.remInPx
    ),

  inset: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.inset,
      'inset',
      config.remInPx,
      true
    ),

  isolation: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['isolation']),

  'justify-content': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['justify-content']),

  'justify-items': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['justify-items']),

  'justify-self': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['justify-self']),

  left: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.inset,
      'left',
      config.remInPx,
      true
    ),

  'letter-spacing': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.letterSpacing,
      'tracking',
      config.remInPx,
      true
    ),

  'line-height': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.lineHeight,
      'leading',
      config.remInPx
    ),

  'list-style-position': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['list-style-position']
    ),

  'list-style-type': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.listStyleType, 'list'),

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
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'mb',
      config.remInPx,
      true
    ),

  'margin-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'ml',
      config.remInPx,
      true
    ),

  'margin-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'mr',
      config.remInPx,
      true
    ),

  'margin-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'mt',
      config.remInPx,
      true
    ),

  'max-height': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.maxHeight,
      'max-h',
      config.remInPx
    ),

  'max-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.maxWidth,
      'max-w',
      config.remInPx
    ),

  'min-height': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.minHeight,
      'min-h',
      config.remInPx
    ),

  'min-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.minWidth,
      'min-w',
      config.remInPx
    ),

  'mix-blend-mode': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['mix-blend-mode']),

  'object-fit': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['object-fit']),

  'object-position': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.objectPosition, 'object'),

  opacity: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.opacity, 'opacity'),

  order: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.order,
      'order',
      null,
      true
    ),

  outline: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['outline']),

  'outline-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.outlineColor,
      'outline'
    ),

  'outline-offset': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.outlineOffset,
      'outline-offset',
      config.remInPx,
      true
    ),

  'outline-style': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['outline-style']),

  'outline-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.outlineWidth,
      'outline',
      config.remInPx
    ),

  overflow: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['overflow']),

  'overflow-wrap': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['overflow-wrap']),

  'overflow-x': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['overflow-x']),

  'overflow-y': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['overflow-y']),

  'overscroll-behavior': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['overscroll-behavior']
    ),
  'overscroll-behavior-x': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['overscroll-behavior-x']
    ),
  'overscroll-behavior-y': declaration =>
    strictConvertDeclaration(
      declaration,
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
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pb',
      config.remInPx
    ),

  'padding-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pl',
      config.remInPx
    ),

  'padding-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pr',
      config.remInPx
    ),

  'padding-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pt',
      config.remInPx
    ),

  'page-break-after': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-after']),

  'page-break-before': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-before']),

  'page-break-inside': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-inside']),

  'place-content': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['place-content']),

  'place-items': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['place-items']),

  'place-self': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['place-self']),

  'pointer-events': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['pointer-events']),

  position: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['position']),

  resize: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['resize']),

  right: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.inset,
      'right',
      config.remInPx,
      true
    ),

  'row-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-y',
      config.remInPx
    ),

  'scroll-behavior': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['scroll-behavior']),

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
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollMargin,
      'scroll-mb',
      config.remInPx,
      true
    ),

  'scroll-margin-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollMargin,
      'scroll-ml',
      config.remInPx,
      true
    ),

  'scroll-margin-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollMargin,
      'scroll-mr',
      config.remInPx,
      true
    ),

  'scroll-margin-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
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
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pb',
      config.remInPx
    ),

  'scroll-padding-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pl',
      config.remInPx
    ),

  'scroll-padding-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pr',
      config.remInPx
    ),

  'scroll-padding-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pt',
      config.remInPx
    ),

  'scroll-snap-align': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['scroll-snap-align']
    ),
  'scroll-snap-type': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['scroll-snap-type']
    ),

  'scroll-snap-stop': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['scroll-snap-stop']
    ),

  stroke: (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.stroke, 'stroke'),

  'stroke-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.strokeWidth,
      'stroke',
      config.remInPx
    ),

  'table-layout': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['table-layout']),

  'text-align': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['text-align']),

  'text-decoration': (declaration, config) => {
    // TODO: parse text-decoration
    return [];
  },

  'text-decoration-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.textDecorationColor,
      'decoration'
    ),

  'text-decoration-line': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['text-decoration-line']
    ),
  'text-decoration-style': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['text-decoration-style']
    ),
  'text-decoration-thickness': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.textDecorationThickness,
      'decoration',
      config.remInPx
    ),

  'text-indent': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.textIndent,
      'indent',
      config.remInPx,
      true
    ),

  'text-overflow': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['text-overflow']),

  'text-transform': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['text-transform']),

  'text-underline-offset': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.textUnderlineOffset,
      'underline-offset',
      config.remInPx
    ),

  top: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.inset,
      'top',
      config.remInPx,
      true
    ),

  'touch-action': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['touch-action']),

  transform: (declaration, config) => {
    let classes: string[] = [];
    const mappings: Record<
      string,
      { mapping: Record<string, string>; classPrefix: string }
    > = {
      scale: { mapping: config.mapping.scale, classPrefix: 'scale' },
      scaleX: { mapping: config.mapping.scale, classPrefix: 'scale-x' },
      scaleY: { mapping: config.mapping.scale, classPrefix: 'scale-y' },
      translate: {
        mapping: config.mapping.translate,
        classPrefix: 'translate',
      },
      translateX: {
        mapping: config.mapping.translate,
        classPrefix: 'translate-x',
      },
      translateY: {
        mapping: config.mapping.translate,
        classPrefix: 'translate-y',
      },
      skewX: {
        mapping: config.mapping.skew,
        classPrefix: 'skew-x',
      },
      skewY: {
        mapping: config.mapping.skew,
        classPrefix: 'skew-y',
      },
      rotate: { mapping: config.mapping.rotate, classPrefix: 'rotate' },
    };

    everyCSSFunction(declaration.value, ({ name, value }) => {
      if (name == null || value == null) {
        classes = [];
        return false;
      }

      const mappingItem = mappings[name];

      if (mappingItem) {
        delete mappings[name];

        const currentClasses = convertSizeDeclarationValue(
          value,
          mappingItem.mapping,
          mappingItem.classPrefix,
          config.remInPx
        );

        if (currentClasses?.length) {
          classes = classes.concat(currentClasses);
          return true;
        }
      }

      return false;
    });

    return classes;
  },

  'transform-origin': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.transformOrigin, 'origin'),

  transition: (declaration, config) => {
    // TODO: parse transition
    return [];
  },

  'transition-delay': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.transitionDelay, 'delay'),

  'transition-duration': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.transitionDuration,
      'duration'
    ),

  'transition-property': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.transitionProperty,
      'transition'
    ),

  'transition-timing-function': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.transitionTimingFunction,
      'ease'
    ),

  'user-select': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['user-select']),

  'vertical-align': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['vertical-align']),

  visibility: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['visibility']),

  'white-space': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['white-space']),

  width: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.width,
      'w',
      config.remInPx
    ),

  'will-change': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.willChange, 'will-change'),

  'word-break': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['word-break']),

  'z-index': (declaration, config) =>
    convertSizeDeclaration(declaration, config.mapping.zIndex, 'z', null, true),
};
