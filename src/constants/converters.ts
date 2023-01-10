import { colord } from 'colord';
import type { Declaration } from 'postcss';
import type { ResolvedTailwindConverterConfig } from '../TailwindConverter';
import { isCSSVariable } from '../utils/isCSSVariable';
import { normalizeNumberValue } from '../utils/normalizeNumberValue';
import { remValueToPx } from '../utils/remValueToPx';
import { UTILITIES_MAPPING } from './utilities-mapping';

function prepareArbitraryValue(value: string) {
  return value.replace(/_/g, '\\_').replace(/\s+/g, '_');
}

function isAmbiguousValue(value: string) {
  return isCSSVariable(value);
}

function convertDeclarationValue(
  value: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  fallbackValue = value
) {
  if (valuesMap[value]) {
    return [`${classPrefix}${valuesMap[value]}`];
  }

  if (isAmbiguousValue(value)) {
    return [];
  }

  return [`${classPrefix}[${prepareArbitraryValue(fallbackValue)}]`];
}

function convertDeclaration(
  declaration: Declaration,
  valuesMap: Record<string, string>,
  classPrefix: string
) {
  return convertDeclarationValue(declaration.value, valuesMap, classPrefix);
}

function strictConvertDeclarationValue(
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
  const parsedColor = colord(declValue);
  const value = parsedColor.isValid() ? parsedColor.toHex() : declValue;

  return convertDeclarationValue(value, valuesMap, classPrefix, declValue);
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
  remInPx: number | null | undefined
) {
  const value = normalizeNumberValue(
    remInPx ? remValueToPx(declValue, remInPx) : declValue
  );

  return convertDeclarationValue(value, valuesMap, classPrefix, declValue);
}

function convertSizeDeclaration(
  declaration: Declaration,
  valuesMap: Record<string, string>,
  classPrefix: string,
  remInPx: number | null | undefined
) {
  return convertSizeDeclarationValue(
    declaration.value,
    valuesMap,
    classPrefix,
    remInPx
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

interface TailwindDeclarationConverters {
  [property: string]: (
    declaration: Declaration,
    config: ResolvedTailwindConverterConfig
  ) => string[];
}

export const TAILWIND_DECLARATION_CONVERTERS: TailwindDeclarationConverters = {
  'accent-color': (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.accentColor, 'accent-'),

  'align-content': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['align-content']),

  'align-items': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['align-items']),

  'align-self': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['align-self']),

  animation: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.animation, 'animate-'),

  appearance: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['appearance']),

  'aspect-ratio': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.aspectRatio, 'aspect-'),

  'backdrop-filter': (declaration, config) => {
    // TODO: transform to classes
    return [];
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
    convertColorDeclaration(declaration, config.mapping.backgroundColor, 'bg-'),

  'background-image': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.backgroundImage, 'bg-'),

  'background-origin': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['background-origin']
    ),

  'background-position': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.backgroundPosition, 'bg-'),

  'background-repeat': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['background-repeat']
    ),

  'background-size': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.backgroundSize,
      'bg-',
      config.remInPx
    ),

  border: (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-'),

  'border-bottom': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-b-'),

  'border-bottom-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-b-'
    ),

  'border-bottom-left-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-bl-',
      config.remInPx
    ),

  'border-bottom-right-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-br-',
      config.remInPx
    ),

  // 'border-bottom-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-bottom-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-b-',
      config.remInPx
    ),

  'border-collapse': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-collapse']),

  'border-color': (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.borderColor, 'border-'),

  'border-left': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-l-'),

  'border-left-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-l-'
    ),

  // 'border-left-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-left-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-l-',
      config.remInPx
    ),

  'border-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-',
      config.remInPx
    ),

  'border-right': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-r-'),

  'border-right-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-r-'
    ),

  // 'border-right-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-right-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-r-',
      config.remInPx
    ),

  'border-spacing': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderSpacing,
      'border-spacing-',
      config.remInPx
    ),

  'border-style': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-top': (declaration, config) =>
    convertBorderDeclaration(declaration, config, 'border-t-'),

  'border-top-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.borderColor,
      'border-t-'
    ),

  'border-top-left-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-tl-',
      config.remInPx
    ),

  'border-top-right-radius': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderRadius,
      'rounded-tr-',
      config.remInPx
    ),

  // 'border-top-style': declaration =>
  //   strictConvertDeclaration(declaration, UTILITIES_MAPPING['border-style']),

  'border-top-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-t-',
      config.remInPx
    ),

  'border-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.borderWidth,
      'border-',
      config.remInPx
    ),

  bottom: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.inset,
      'bottom-',
      config.remInPx
    ),

  'box-decoration-break': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['box-decoration-break']
    ),

  'box-shadow': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.boxShadow, 'shadow-'),

  'box-sizing': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['box-sizing']),

  'break-after': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-after']),

  'break-before': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-before']),

  'break-inside': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['break-inside']),

  'caret-color': (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.caretColor, 'caret-'),

  clear: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['clear']),

  color: (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.textColor, 'text-'),

  'column-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-x-',
      config.remInPx
    ),

  columns: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.columns,
      'columns-',
      config.remInPx
    ),

  content: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.content, 'content-'),

  cursor: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.cursor, 'cursor-'),

  display: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['display']),

  fill: (declaration, config) =>
    convertColorDeclaration(declaration, config.mapping.fill, 'fill-'),

  filter: (declaration, config) => {
    // TODO: parse filters
    return [];
  },

  flex: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.flex, 'flex-'),

  'flex-basis': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.flexBasis,
      'basis-',
      config.remInPx
    ),

  'flex-direction': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['flex-direction']),

  'flex-flow': (declaration, config) => {
    // TODO: parse flex-flow
    return [];
  },

  'flex-grow': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.flexGrow, 'grow-'),

  'flex-shrink': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.flexShrink, 'shrink-'),

  'flex-wrap': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['flex-wrap']),

  float: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['float']),

  'font-size': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.fontSize,
      'text-',
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
    convertDeclaration(declaration, config.mapping.fontWeight, 'font-'),

  gap: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-',
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
      'auto-cols-'
    ),

  'grid-auto-flow': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['grid-auto-flow']),

  'grid-auto-rows': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridAutoRows, 'auto-rows-'),

  'grid-column': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridColumn, 'col-'),

  'grid-column-end': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridColumnEnd, 'col-end-'),

  'grid-column-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-x-',
      config.remInPx
    ),

  'grid-column-start': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.gridColumnStart,
      'col-start-'
    ),

  'grid-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-',
      config.remInPx
    ),

  'grid-row': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridRow, 'row-'),

  'grid-row-end': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridRowEnd, 'row-end-'),

  'grid-row-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-y-',
      config.remInPx
    ),

  'grid-row-start': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.gridRowStart, 'row-start-'),

  'grid-template-columns': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.gridTemplateColumns,
      'grid-cols-'
    ),

  'grid-template-rows': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.gridTemplateRows,
      'grid-rows-'
    ),

  height: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.height,
      'h-',
      config.remInPx
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
      'left-',
      config.remInPx
    ),

  'letter-spacing': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.letterSpacing,
      'tracking-',
      config.remInPx
    ),

  'line-height': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.lineHeight,
      'leading-',
      config.remInPx
    ),

  'list-style-position': declaration =>
    strictConvertDeclaration(
      declaration,
      UTILITIES_MAPPING['list-style-position']
    ),

  'list-style-type': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.listStyleType, 'list-'),

  margin: (declaration, config) => {
    // TODO: parse margin
    return [];
  },

  'margin-bottom': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'mb-',
      config.remInPx
    ),

  'margin-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'ml-',
      config.remInPx
    ),

  'margin-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'mr-',
      config.remInPx
    ),

  'margin-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.margin,
      'mt-',
      config.remInPx
    ),

  'max-height': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.maxHeight,
      'max-h-',
      config.remInPx
    ),

  'max-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.maxWidth,
      'max-w-',
      config.remInPx
    ),

  'min-height': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.minHeight,
      'min-h-',
      config.remInPx
    ),

  'min-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.minWidth,
      'min-w-',
      config.remInPx
    ),

  'mix-blend-mode': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['mix-blend-mode']),

  'object-fit': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['object-fit']),

  'object-position': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.objectPosition, 'object-'),

  opacity: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.opacity, 'opacity-'),

  order: (declaration, config) =>
    convertDeclaration(declaration, config.mapping.order, 'order-'),

  outline: declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['outline']),

  'outline-color': (declaration, config) =>
    convertColorDeclaration(
      declaration,
      config.mapping.outlineColor,
      'outline-'
    ),

  'outline-offset': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.outlineOffset,
      'outline-offset-',
      config.remInPx
    ),

  'outline-style': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['outline-style']),

  'outline-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.outlineWidth,
      'outline-',
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

  padding: (declaration, config) => {
    // TODO: parse padding
    return [];
  },

  'padding-bottom': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pb-',
      config.remInPx
    ),

  'padding-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pl-',
      config.remInPx
    ),

  'padding-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pr-',
      config.remInPx
    ),

  'padding-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.padding,
      'pt-',
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
      'right-',
      config.remInPx
    ),

  'row-gap': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.gap,
      'gap-y-',
      config.remInPx
    ),

  'scroll-behavior': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['scroll-behavior']),

  'scroll-margin': (declaration, config) => {
    // TODO: parse scroll margin
    return [];
  },

  'scroll-margin-bottom': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollMargin,
      'scroll-mb-',
      config.remInPx
    ),

  'scroll-margin-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollMargin,
      'scroll-ml-',
      config.remInPx
    ),

  'scroll-margin-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollMargin,
      'scroll-mr-',
      config.remInPx
    ),

  'scroll-margin-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollMargin,
      'scroll-mt-',
      config.remInPx
    ),

  'scroll-padding': (declaration, config) => {
    // TODO: parse scroll padding
    return [];
  },

  'scroll-padding-bottom': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pb-',
      config.remInPx
    ),

  'scroll-padding-left': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pl-',
      config.remInPx
    ),

  'scroll-padding-right': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pr-',
      config.remInPx
    ),

  'scroll-padding-top': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.scrollPadding,
      'scroll-pt-',
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
    convertColorDeclaration(declaration, config.mapping.stroke, 'stroke-'),

  'stroke-width': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.strokeWidth,
      'stroke-',
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
      'decoration-'
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
      'decoration-',
      config.remInPx
    ),

  'text-indent': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.textIndent, 'indent-'),

  'text-overflow': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['text-overflow']),

  'text-transform': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['text-transform']),

  'text-underline-offset': (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.textUnderlineOffset,
      'underline-offset-',
      config.remInPx
    ),

  top: (declaration, config) =>
    convertSizeDeclaration(
      declaration,
      config.mapping.inset,
      'top-',
      config.remInPx
    ),

  'touch-action': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['touch-action']),

  transform: (declaration, config) => {
    // TODO: parse transform
    return [];
  },

  'transform-origin': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.transformOrigin, 'origin-'),

  transition: (declaration, config) => {
    // TODO: parse transition
    return [];
  },

  'transition-delay': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.transitionDelay, 'delay-'),

  'transition-duration': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.transitionDuration,
      'duration-'
    ),

  'transition-property': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.transitionProperty,
      'transition-'
    ),

  'transition-timing-function': (declaration, config) =>
    convertDeclaration(
      declaration,
      config.mapping.transitionTimingFunction,
      'ease-'
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
      'w-',
      config.remInPx
    ),

  'will-change': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.willChange, 'will-change-'),

  'word-break': declaration =>
    strictConvertDeclaration(declaration, UTILITIES_MAPPING['word-break']),

  'z-index': (declaration, config) =>
    convertDeclaration(declaration, config.mapping.zIndex, 'z-'),
};
