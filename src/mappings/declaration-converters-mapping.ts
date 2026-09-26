import type { Declaration } from 'postcss';
import type { ResolvedTailwindConverterConfig } from '../TailwindConverter';
import type { ConvertedUtility } from '../core/placement';
import { UTILITIES_MAPPING } from './utilities-mapping';
import {
  normalizeColorValue,
  normalizeSizeValue,
  normalizeValue,
} from '../utils/converterMappingByTailwindTheme';
import {
  hasTopLevelDivider,
  isSingleToken,
  parseFunctionList,
  splitBySpaces,
  splitByTopLevelCommas,
} from '../core/values';
import { isCSSVariable } from '../utils/isCSSVariable';
import { getOwn } from '../utils/getOwn';
import { isCSSWideKeyword } from '../utils/isCSSWideKeyword';
import { isTimeValue, normalizeTimeValue } from '../utils/normalizeTimeValue';

export function prepareArbitraryValue(value: string) {
  return normalizeValue(value).replace(/_/g, '\\_').replace(/\s+/g, '_');
}

type CSSDataType =
  | 'color'
  | 'length'
  | 'number'
  | 'image'
  | 'position'
  | 'family-name'
  | 'shadow';

export function convertDeclarationValue(
  value: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  fallbackValue = value,
  fallbackClassPrefix = classPrefix,
  cssDataType: CSSDataType | null = null,
  alwaysUseDataType = false
) {
  const normalizedValue = normalizeValue(value);
  const mappedValue = getOwn(valuesMap, normalizedValue);
  if (mappedValue) {
    if (mappedValue === 'DEFAULT') {
      return [classPrefix];
    }

    return [`${classPrefix}-${mappedValue}`];
  }

  const arbitraryValue = prepareArbitraryValue(fallbackValue);

  // Tailwind crashes on arbitrary values like `[constructor]` (it looks them up in plain objects),
  // it reads `\_` as `_` and `_` as a space
  const tailwindValue = arbitraryValue.replace(/\\?_/g, underscore =>
    underscore === '_' ? ' ' : '_'
  );
  if (!arbitraryValue || tailwindValue in Object.prototype) {
    return [];
  }

  if (
    cssDataType &&
    (alwaysUseDataType ||
      isCSSVariable(arbitraryValue) ||
      isCSSWideKeyword(arbitraryValue))
  ) {
    return [`${fallbackClassPrefix}-[${cssDataType}:${arbitraryValue}]`];
  }

  return [`${fallbackClassPrefix}-[${arbitraryValue}]`];
}

export function strictConvertDeclarationValue(
  value: string,
  valuesMap: Record<string, string>
) {
  const key = value.trim();
  const mapped = getOwn(valuesMap, key) || getOwn(valuesMap, key.toLowerCase());

  return mapped ? [mapped] : [];
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

const DIMENSION_REGEXP = /^([+-]?(?:\d*\.)?\d+)([a-z]+)$/i;

/**
 * Units are case-insensitive in CSS, but Tailwind recognizes only lowercase ones in arbitrary values.
 */
function lowerCaseUnit(value: string) {
  const match = value.trim().match(DIMENSION_REGEXP);

  return match ? match[1] + match[2].toLowerCase() : value;
}

function convertSizeDeclarationValue(
  rawDeclValue: string,
  valuesMap: Record<string, string>,
  classPrefix: string,
  remInPx: number | null | undefined,
  supportsNegativeValues = false,
  cssDataType: CSSDataType | null = null
) {
  const declValue = lowerCaseUnit(rawDeclValue);
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

function toClassNames(utilities: ConvertedUtility[]) {
  return utilities.map(utility => utility.className);
}

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
type BorderSide = (typeof BORDER_SIDES)[number];

const BORDER_STYLES = new Set([
  'none',
  'hidden',
  'dotted',
  'dashed',
  'solid',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
]);

const LENGTH_REGEXP = /^[+-]?(\d*\.)?\d+([a-z]+|%)?$/i;
const LENGTH_FUNCTION_REGEXP = /^(calc|min|max|clamp)\(/i;

function isLengthLike(value: string) {
  return (
    LENGTH_REGEXP.test(value) ||
    LENGTH_FUNCTION_REGEXP.test(value) ||
    ['thin', 'medium', 'thick'].includes(value.toLowerCase())
  );
}

function borderLonghands(part: 'width' | 'style' | 'color', side?: BorderSide) {
  return (side ? [side] : BORDER_SIDES).map(s => `border-${s}-${part}`);
}

/**
 * Converts `border` and `border-{side}` shorthands. The value is converted entirely or not at all.
 */
export function convertBorderDeclarationToUtilities(
  value: string,
  config: ResolvedTailwindConverterConfig,
  classPrefix: string,
  side?: BorderSide
): ConvertedUtility[] {
  const tokens = splitBySpaces(value);

  if (!tokens.length || tokens.length > 3 || hasTopLevelDivider(value)) {
    return [];
  }

  let width: string | null = null;
  let style: string | null = null;
  let color: string | null = null;

  for (const token of tokens) {
    const lowerCased = token.toLowerCase();

    if (BORDER_STYLES.has(lowerCased)) {
      if (style) return [];
      style = lowerCased;
    } else if (isLengthLike(token)) {
      if (width) return [];
      width = token;
    } else {
      if (color) return [];
      color = token;
    }
  }

  // `var()` may stand for any part of the shorthand (or several of them), unless the other parts
  // are set; a CSS-wide keyword sets all of them
  if (
    (tokens.length === 1 && isCSSWideKeyword(tokens[0])) ||
    (color && /\bvar\(/i.test(color) && !(width && style))
  ) {
    return [];
  }

  const { corePlugins } = config.tailwindConfig;

  const convertWidth = (widthValue: string): ConvertedUtility | null => {
    if (!corePlugins.borderWidth) {
      return null;
    }

    const [className] = convertSizeDeclarationValue(
      widthValue,
      config.mapping.borderWidth,
      classPrefix,
      config.remInPx,
      false,
      'length'
    );

    return className
      ? { className, props: borderLonghands('width', side) }
      : null;
  };

  const convertStyle = (styleValue: string): ConvertedUtility | null => {
    if (!corePlugins.borderStyle) {
      return null;
    }

    const [className] = strictConvertDeclarationValue(
      styleValue,
      UTILITIES_MAPPING['border-style']
    );

    // the style utility sets all sides, even for a side shorthand
    return className ? { className, props: borderLonghands('style') } : null;
  };

  const convertColor = (colorValue: string): ConvertedUtility | null => {
    if (!corePlugins.borderColor) {
      return null;
    }

    const [className] = convertColorDeclarationValue(
      colorValue,
      config.mapping.borderColor,
      classPrefix,
      'color'
    );

    return className
      ? { className, props: borderLonghands('color', side) }
      : null;
  };

  let utilities: Array<ConvertedUtility | null>;
  // the idiomatic utilities of an invisible border don't reset all its parts
  let partial = false;

  if (!style || style === 'none') {
    const hasOnlyStyle = (!width || isZeroValue(width)) && !color;

    if (hasOnlyStyle) {
      // A border without a style (`none` is the initial one) isn't drawn and takes no space,
      // which is the same as a zero width.
      utilities = [side || width ? convertWidth('0') : convertStyle('none')];
      partial = true;
    } else if (side) {
      // the width and the color are kept for a style set later, but a side style can't be reset
      return [];
    } else if (!width) {
      // The width isn't reset to `medium`: the preflight sets a zero width,
      // which a style set elsewhere (e.g. by `border-t border-solid`) would reveal
      utilities = [convertStyle('none'), convertColor(color as string)];
      partial = true;
    } else {
      utilities = [
        convertWidth(width),
        convertStyle('none'),
        convertColor(color ?? 'currentColor'),
      ];
    }
  } else if (side && (config.strict || style !== 'solid')) {
    // Tailwind has no per-side border styles, so the style of a side shorthand is applied
    // to all sides. That's only acceptable for `solid`, the style of all borders in Tailwind.
    return [];
  } else {
    // The shorthand resets omitted parts to their initial values, while Tailwind's preflight
    // sets a zero width and a theme color by default.
    utilities = [
      convertWidth(width ?? 'medium'),
      convertStyle(style),
      convertColor(color ?? 'currentColor'),
    ];
  }

  if (!utilities.every(utility => utility)) {
    return [];
  }

  return (utilities as ConvertedUtility[]).map(utility =>
    partial ? { ...utility, partial } : utility
  );
}

function parseComposedSpacingValue(value: string) {
  const values = splitBySpaces(value);

  if (
    !values.length ||
    values.length > 4 ||
    splitByTopLevelCommas(value).length > 1 ||
    values.some(item => item.includes('/') && !item.includes('('))
  ) {
    return { top: null, right: null, bottom: null, left: null };
  }

  return {
    top: values[0],
    right: values[1] || values[0],
    bottom: values[2] || values[0],
    left: values[3] || values[1] || values[0],
  };
}

interface ComposedSpacingMapping {
  /** Prefix of the shorthand utility, e.g. `m` */
  classPrefix?: string;
  top: { valuesMapping: Record<string, string>; classPrefix: string };
  right: { valuesMapping: Record<string, string>; classPrefix: string };
  bottom: { valuesMapping: Record<string, string>; classPrefix: string };
  left: { valuesMapping: Record<string, string>; classPrefix: string };
}

/**
 * Converts `margin`/`padding`/`scroll-margin`/`scroll-padding` shorthands to one utility per side
 * (they are merged back by `reduceTailwindClasses`). The value is converted entirely or not at all.
 */
export function convertComposedSpacingDeclarationToUtilities(
  value: string,
  mapping: ComposedSpacingMapping,
  remInPx: number | null | undefined,
  property: string,
  supportsNegativeValues = true
): ConvertedUtility[] {
  if (/\bvar\(/i.test(value)) {
    // a variable may stand for several values, so the value can't be split into sides
    if (!mapping.classPrefix || splitByTopLevelCommas(value).length !== 1) {
      return [];
    }

    // the shorthand utility is used, e.g. `m-spacing-a` (a theme value) or `m-[var(--a)]`
    return convertSizeDeclarationValue(
      value,
      mapping.top.valuesMapping,
      mapping.classPrefix,
      remInPx,
      supportsNegativeValues
    ).map(className => ({
      className,
      props: BORDER_SIDES.map(side => `${property}-${side}`),
    }));
  }

  const parsed = parseComposedSpacingValue(value);
  const utilities: ConvertedUtility[] = [];

  for (const side of BORDER_SIDES) {
    const sideValue = parsed[side];
    const { valuesMapping, classPrefix } = mapping[side] || {};

    if (!sideValue || !valuesMapping || !classPrefix) {
      return [];
    }

    const [className] = convertSizeDeclarationValue(
      sideValue,
      valuesMapping,
      classPrefix,
      remInPx,
      supportsNegativeValues
    );

    if (!className) {
      return [];
    }

    utilities.push({ className, props: [`${property}-${side}`] });
  }

  return utilities;
}

/**
 * @deprecated Use `convertComposedSpacingDeclarationToUtilities`.
 */
export function convertComposedSpacingDeclarationValue(
  value: string,
  mapping: ComposedSpacingMapping,
  remInPx: number | null | undefined,
  supportsNegativeValues = true
) {
  return toClassNames(
    convertComposedSpacingDeclarationToUtilities(
      value,
      mapping,
      remInPx,
      'spacing',
      supportsNegativeValues
    )
  );
}

function composedSpacingMapping(
  valuesMapping: Record<string, string>,
  classPrefix: string
): ComposedSpacingMapping {
  return {
    classPrefix,
    top: { valuesMapping, classPrefix: `${classPrefix}t` },
    right: { valuesMapping, classPrefix: `${classPrefix}r` },
    bottom: { valuesMapping, classPrefix: `${classPrefix}b` },
    left: { valuesMapping, classPrefix: `${classPrefix}l` },
  };
}

const TIMING_FUNCTION_KEYWORDS = new Set([
  'ease',
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
]);
const TIMING_FUNCTION_REGEXP = /^(cubic-bezier|steps|linear)\(/i;

/**
 * Converts a single-item `transition` shorthand. Lists of transitions are not convertible,
 * since Tailwind applies one duration/timing function/delay to all transitioned properties.
 */
export function convertTransitionDeclarationToUtilities(
  value: string,
  config: ResolvedTailwindConverterConfig
): ConvertedUtility[] {
  if (splitByTopLevelCommas(value).length !== 1 || isCSSWideKeyword(value)) {
    return [];
  }

  let property: string | null = null;
  let duration: string | null = null;
  let delay: string | null = null;
  let timingFunction: string | null = null;

  for (const token of splitBySpaces(value)) {
    const lowerCased = token.toLowerCase();

    if (isTimeValue(token)) {
      if (duration == null) {
        duration = token;
      } else if (delay == null) {
        delay = token;
      } else {
        return [];
      }
    } else if (
      TIMING_FUNCTION_KEYWORDS.has(lowerCased) ||
      TIMING_FUNCTION_REGEXP.test(token)
    ) {
      if (timingFunction) return [];
      timingFunction = token;
    } else if (/^-?[a-z_][\w-]*$/i.test(token)) {
      if (property) return [];
      property = token;
    } else {
      return [];
    }
  }

  const { corePlugins } = config.tailwindConfig;

  if (property?.toLowerCase() === 'none') {
    return !duration &&
      !delay &&
      !timingFunction &&
      corePlugins.transitionProperty
      ? [{ className: 'transition-none', props: ['transition-property'] }]
      : [];
  }

  if (config.strict) {
    // Tailwind's transition-property utilities set a default duration and timing function,
    // while the shorthand resets them to `0s` and `ease`, and resets the delay to `0s`
    duration = duration ?? '0s';
    timingFunction = timingFunction ?? 'ease';
    delay = delay ?? '0s';
  }

  const parts: Array<{
    plugin: boolean | undefined;
    convert: () => string[];
    props: string[];
  }> = [
    {
      plugin: corePlugins.transitionProperty,
      convert: () =>
        convertDeclarationValue(
          property || 'all',
          config.mapping.transitionProperty,
          'transition'
        ),
      props: ['transition-property'],
    },
  ];

  if (duration) {
    const value = duration;
    parts.push({
      plugin: corePlugins.transitionDuration,
      convert: () =>
        convertDeclarationValue(
          normalizeTimeValue(value),
          config.mapping.transitionDuration,
          'duration',
          value
        ),
      props: ['transition-duration'],
    });
  }

  if (timingFunction) {
    const value = timingFunction;
    parts.push({
      plugin: corePlugins.transitionTimingFunction,
      convert: () =>
        convertDeclarationValue(
          value,
          config.mapping.transitionTimingFunction,
          'ease'
        ),
      props: ['transition-timing-function'],
    });
  }

  if (delay) {
    const value = delay;
    parts.push({
      plugin: corePlugins.transitionDelay,
      convert: () =>
        convertDeclarationValue(
          normalizeTimeValue(value),
          config.mapping.transitionDelay,
          'delay',
          value
        ),
      props: ['transition-delay'],
    });
  }

  const utilities: ConvertedUtility[] = [];

  for (const part of parts) {
    const [className] = part.plugin ? part.convert() : [];

    if (!className) {
      return [];
    }

    utilities.push({ className, props: part.props });
  }

  return utilities;
}

/** Order in which Tailwind applies filter functions (`filter` / `backdrop-filter`). */
const FILTER_FUNCTIONS_ORDER = [
  'blur',
  'brightness',
  'contrast',
  'grayscale',
  'hue-rotate',
  'invert',
  'saturate',
  'sepia',
  'drop-shadow',
];
const BACKDROP_FILTER_FUNCTIONS_ORDER = [
  'blur',
  'brightness',
  'contrast',
  'grayscale',
  'hue-rotate',
  'invert',
  'opacity',
  'saturate',
  'sepia',
];

/**
 * Converts a list of filter functions. Tailwind composes filters in a fixed order,
 * so a value is converted only if its functions follow that order without repetitions.
 */
function convertFilterFunctions(
  value: string,
  functionsOrder: string[],
  getValuesMapping: (
    name: string
  ) => Record<string, string> | false | undefined,
  classPrefix: (name: string) => string,
  remInPx: number | null | undefined
) {
  const functions = parseFunctionList(value);

  if (!functions?.length) {
    return [];
  }

  let classes: string[] = [];
  let lastIndex = -1;

  for (const { name, args } of functions) {
    const lowerCasedName = name.toLowerCase();
    const index = functionsOrder.indexOf(lowerCasedName);
    const valuesMapping = getValuesMapping(lowerCasedName);

    if (index <= lastIndex || !valuesMapping || args.length !== 1) {
      return [];
    }

    lastIndex = index;
    const [arg] = args;
    const isDropShadow = lowerCasedName === 'drop-shadow';

    if (!arg || (!isDropShadow && !isSingleToken(arg))) {
      return [];
    }

    const converted = isDropShadow
      ? convertDeclarationValue(arg, valuesMapping, classPrefix(lowerCasedName))
      : convertSizeDeclarationValue(
          arg,
          valuesMapping,
          classPrefix(lowerCasedName),
          remInPx,
          lowerCasedName === 'hue-rotate'
        );

    if (!converted.length) {
      return [];
    }

    classes = classes.concat(converted);
  }

  return classes;
}

function isZeroValue(value: string) {
  return parseFloat(value) === 0 && /^[+-]?(0*\.)?0+[a-z%]*$/i.test(value);
}

type TransformComponent =
  | 'translate-x'
  | 'translate-y'
  | 'rotate'
  | 'skew-x'
  | 'skew-y'
  | 'scale-x'
  | 'scale-y';

/**
 * Groups of transform components in the order Tailwind applies them:
 * `translate() rotate() skewX() skewY() scaleX() scaleY()`.
 * Components within a group commute, so their relative order doesn't matter.
 */
const TRANSFORM_COMPONENT_GROUPS: Record<TransformComponent, number> = {
  'translate-x': 0,
  'translate-y': 0,
  rotate: 1,
  'skew-x': 2,
  'skew-y': 3,
  'scale-x': 4,
  'scale-y': 4,
};

function transformFunctionToComponents(
  name: string,
  args: string[]
): Array<[TransformComponent, string]> | null {
  if (!args.length || args.some(arg => !arg || !isSingleToken(arg))) {
    return null;
  }

  const [first, second] = args;

  switch (name.toLowerCase()) {
    case 'translate':
      if (args.length > 2) return null;
      return second
        ? [
            ['translate-x', first],
            ['translate-y', second],
          ]
        : [['translate-x', first]];
    case 'translatex':
      return args.length === 1 ? [['translate-x', first]] : null;
    case 'translatey':
      return args.length === 1 ? [['translate-y', first]] : null;
    case 'rotate':
    case 'rotatez':
      return args.length === 1 ? [['rotate', first]] : null;
    case 'skew':
      if (args.length > 2) return null;
      if (!second || isZeroValue(second)) return [['skew-x', first]];
      // skew(a, b) equals skewX(a) skewY(b) only if one of the angles is zero
      if (isZeroValue(first)) return [['skew-y', second]];
      return null;
    case 'skewx':
      return args.length === 1 ? [['skew-x', first]] : null;
    case 'skewy':
      return args.length === 1 ? [['skew-y', first]] : null;
    case 'scale':
      if (args.length > 2) return null;
      return [
        ['scale-x', first],
        ['scale-y', second || first],
      ];
    case 'scalex':
      return args.length === 1 ? [['scale-x', first]] : null;
    case 'scaley':
      return args.length === 1 ? [['scale-y', first]] : null;
    default:
      return null;
  }
}

function convertTransformDeclarationValue(
  value: string,
  config: ResolvedTailwindConverterConfig
) {
  const { corePlugins } = config.tailwindConfig;
  const keyword = strictConvertDeclarationValue(
    value.replace(/\s+/g, ''),
    UTILITIES_MAPPING['transform']
  );

  if (keyword.length) {
    // `transform-gpu`/`transform-cpu` compose the transform of the other utilities
    return config.strict && keyword[0] !== 'transform-none' ? [] : keyword;
  }

  if (config.strict) {
    // the utilities of transform functions compose with the ones set by other rules
    // (e.g. `rotate-45 hover:translate-x-1` keeps the rotation on hover)
    return [];
  }

  const functions = parseFunctionList(value);

  if (!functions?.length) {
    return [];
  }

  const components: Array<[TransformComponent, string]> = [];

  for (const { name, args } of functions) {
    const functionComponents = transformFunctionToComponents(name, args);

    if (!functionComponents) {
      return [];
    }

    components.push(...functionComponents);
  }

  const usedComponents = new Set<TransformComponent>();
  let lastGroup = -1;
  let classes: string[] = [];

  for (const [component, componentValue] of components) {
    const group = TRANSFORM_COMPONENT_GROUPS[component];

    if (usedComponents.has(component) || group < lastGroup) {
      return [];
    }

    usedComponents.add(component);
    lastGroup = group;

    let converted: string[] = [];

    if (component.startsWith('translate')) {
      converted = corePlugins.translate
        ? convertSizeDeclarationValue(
            componentValue,
            config.mapping.translate,
            component,
            config.remInPx,
            true
          )
        : [];
    } else if (component === 'rotate') {
      converted = corePlugins.rotate
        ? convertSizeDeclarationValue(
            componentValue,
            config.mapping.rotate,
            'rotate',
            config.remInPx,
            true
          )
        : [];
    } else if (component.startsWith('skew')) {
      converted = corePlugins.skew
        ? convertSizeDeclarationValue(
            componentValue,
            config.mapping.skew,
            component,
            config.remInPx,
            true
          )
        : [];
    } else {
      converted = corePlugins.scale
        ? convertSizeDeclarationValue(
            componentValue,
            config.mapping.scale,
            component,
            config.remInPx,
            true
          )
        : [];
    }

    if (!converted.length) {
      return [];
    }

    classes = classes.concat(converted);
  }

  return classes;
}

function expandFlexValue(value: string) {
  const tokens = splitBySpaces(value);
  const isNumber = (token: string) => /^(\d*\.)?\d+$/.test(token);

  if (tokens.length === 1) {
    const [token] = tokens;
    const keywords: Record<string, string> = {
      auto: '1 1 auto',
      none: '0 0 auto',
      initial: '0 1 auto',
    };
    const keyword = getOwn(keywords, token.toLowerCase());

    if (keyword) return keyword;
    return isNumber(token) ? `${token} 1 0%` : `1 1 ${token}`;
  }

  if (tokens.length === 2) {
    const [grow, shrinkOrBasis] = tokens;

    return isNumber(shrinkOrBasis)
      ? `${grow} ${shrinkOrBasis} 0%`
      : `${grow} 1 ${shrinkOrBasis}`;
  }

  return tokens.join(' ');
}

const expandedFlexMappings = new WeakMap<
  Record<string, string>,
  Record<string, string>
>();

/** Theme `flex` values with keywords expanded, so that `flex: none` matches `flex-none`. */
function expandedFlexMapping(mapping: Record<string, string> = {}) {
  let expanded = expandedFlexMappings.get(mapping);

  if (!expanded) {
    expanded = {};
    for (const value of Object.keys(mapping)) {
      expanded[expandFlexValue(value)] = mapping[value];
    }
    expandedFlexMappings.set(mapping, expanded);
  }

  return expanded;
}

const FONT_WEIGHT_KEYWORDS: Record<string, string> = {
  normal: '400',
  bold: '700',
};

type DeclarationConverter = (
  declaration: Declaration,
  config: ResolvedTailwindConverterConfig
) => string[];

interface DeclarationConvertersMapping {
  [property: string]: DeclarationConverter;
}

type DeclarationUtilitiesConverter = (
  declaration: Declaration,
  config: ResolvedTailwindConverterConfig
) => ConvertedUtility[];

/**
 * Converters of shorthands whose utilities stand for different longhand properties.
 * Every other converter produces utilities that stand for all longhands of the declaration.
 */
const FONT_SMOOTHING_PROPS = [
  '-webkit-font-smoothing',
  '-moz-osx-font-smoothing',
];

/** Font smoothing utilities set both vendor properties. */
const convertFontSmoothingDeclarationToUtilities: DeclarationUtilitiesConverter =
  (declaration, config) =>
    config.tailwindConfig.corePlugins.fontSmoothing
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['font-smoothing']
        ).map(className => ({ className, props: FONT_SMOOTHING_PROPS }))
      : [];

type BorderWidthGroup = [
  value: string,
  classPrefix: string,
  sides: BorderSide[]
];

/**
 * Converts `border-width` with up to 4 values to utilities of the sides, e.g. `1px 0` becomes
 * `border-y border-x-0`. Zero widths are kept, since they override widths set elsewhere.
 */
const convertBorderWidthDeclarationToUtilities: DeclarationUtilitiesConverter =
  (declaration, config) => {
    if (
      !config.tailwindConfig.corePlugins.borderWidth ||
      hasTopLevelDivider(declaration.value)
    ) {
      return [];
    }

    const values = splitBySpaces(declaration.value);
    const convert = (
      value: string,
      classPrefix: string,
      sides: readonly BorderSide[]
    ): ConvertedUtility[] =>
      convertSizeDeclarationValue(
        value,
        config.mapping.borderWidth,
        classPrefix,
        config.remInPx,
        false,
        'length'
      ).map(className => ({
        className,
        props: sides.map(side => `border-${side}-width`),
      }));

    if (values.length === 1) {
      return convert(values[0], 'border', BORDER_SIDES);
    }

    // a variable may stand for several values, so the sides can't be determined
    if (values.length > 4 || values.some(value => /\bvar\(/i.test(value))) {
      return [];
    }

    const [top, right = top, bottom = top, left = right] = values;
    const vertical: BorderWidthGroup[] =
      top === bottom
        ? [[top, 'border-y', ['top', 'bottom']]]
        : [
            [top, 'border-t', ['top']],
            [bottom, 'border-b', ['bottom']],
          ];
    const horizontal: BorderWidthGroup[] =
      right === left
        ? [[right, 'border-x', ['right', 'left']]]
        : [
            [right, 'border-r', ['right']],
            [left, 'border-l', ['left']],
          ];
    const utilities: ConvertedUtility[] = [];

    for (const [value, classPrefix, sides] of [...vertical, ...horizontal]) {
      const converted = convert(value, classPrefix, sides);

      if (!converted.length) {
        return [];
      }

      utilities.push(...converted);
    }

    return utilities;
  };

export const DECLARATION_UTILITIES_CONVERTERS_MAPPING: Record<
  string,
  DeclarationUtilitiesConverter
> = {
  '-moz-osx-font-smoothing': convertFontSmoothingDeclarationToUtilities,
  '-webkit-font-smoothing': convertFontSmoothingDeclarationToUtilities,
  border: (declaration, config) =>
    convertBorderDeclarationToUtilities(declaration.value, config, 'border'),
  'border-top': (declaration, config) =>
    convertBorderDeclarationToUtilities(
      declaration.value,
      config,
      'border-t',
      'top'
    ),
  'border-right': (declaration, config) =>
    convertBorderDeclarationToUtilities(
      declaration.value,
      config,
      'border-r',
      'right'
    ),
  'border-bottom': (declaration, config) =>
    convertBorderDeclarationToUtilities(
      declaration.value,
      config,
      'border-b',
      'bottom'
    ),
  'border-left': (declaration, config) =>
    convertBorderDeclarationToUtilities(
      declaration.value,
      config,
      'border-l',
      'left'
    ),
  'border-width': convertBorderWidthDeclarationToUtilities,
  margin: (declaration, config) =>
    config.tailwindConfig.corePlugins.margin
      ? convertComposedSpacingDeclarationToUtilities(
          declaration.value,
          composedSpacingMapping(config.mapping.margin, 'm'),
          config.remInPx,
          'margin'
        )
      : [],
  padding: (declaration, config) =>
    config.tailwindConfig.corePlugins.padding
      ? convertComposedSpacingDeclarationToUtilities(
          declaration.value,
          composedSpacingMapping(config.mapping.padding, 'p'),
          config.remInPx,
          'padding',
          false
        )
      : [],
  'scroll-margin': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollMargin
      ? convertComposedSpacingDeclarationToUtilities(
          declaration.value,
          composedSpacingMapping(config.mapping.scrollMargin, 'scroll-m'),
          config.remInPx,
          'scroll-margin'
        )
      : [],
  'scroll-padding': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollPadding
      ? convertComposedSpacingDeclarationToUtilities(
          declaration.value,
          composedSpacingMapping(config.mapping.scrollPadding, 'scroll-p'),
          config.remInPx,
          'scroll-padding',
          false
        )
      : [],
  transition: (declaration, config) =>
    convertTransitionDeclarationToUtilities(declaration.value, config),
  // `break-normal` also resets `overflow-wrap`
  'word-break': (declaration, config) =>
    DECLARATION_CONVERTERS_MAPPING['word-break'](declaration, config).map(
      className => ({
        className,
        props:
          className === 'break-normal'
            ? ['word-break', 'overflow-wrap']
            : ['word-break'],
      })
    ),
};

export const DECLARATION_CONVERTERS_MAPPING: DeclarationConvertersMapping = {
  '-moz-osx-font-smoothing': (declaration, config) =>
    config.tailwindConfig.corePlugins.fontSmoothing
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['font-smoothing']
        )
      : [],

  '-webkit-font-smoothing': (declaration, config) =>
    config.tailwindConfig.corePlugins.fontSmoothing
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['font-smoothing']
        )
      : [],

  'accent-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.accentColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.accentColor,
          'accent',
          'color'
        )
      : [],

  'align-content': (declaration, config) =>
    config.tailwindConfig.corePlugins.alignContent
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['align-content']
        )
      : [],

  'align-items': (declaration, config) =>
    config.tailwindConfig.corePlugins.alignItems
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['align-items']
        )
      : [],

  'align-self': (declaration, config) =>
    config.tailwindConfig.corePlugins.alignSelf
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['align-self']
        )
      : [],

  animation: (declaration, config) =>
    config.tailwindConfig.corePlugins.animation
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.animation,
          'animate'
        )
      : [],

  appearance: (declaration, config) =>
    config.tailwindConfig.corePlugins.appearance
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['appearance']
        )
      : [],

  'aspect-ratio': (declaration, config) =>
    config.tailwindConfig.corePlugins.aspectRatio
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.aspectRatio,
          'aspect'
        )
      : [],

  'backdrop-filter': (declaration, config) => {
    const { corePlugins } = config.tailwindConfig;

    if (!corePlugins.backdropFilter) {
      return [];
    }

    if (declaration.value.trim().toLowerCase() === 'none') {
      return ['backdrop-filter-none'];
    }

    if (config.strict) {
      // the utilities of filter functions compose with the ones set by other rules
      return [];
    }

    const mappings: Record<string, Record<string, string> | undefined | false> =
      {
        blur: corePlugins.backdropBlur && config.mapping.backdropBlur,
        brightness:
          corePlugins.backdropBrightness && config.mapping.backdropBrightness,
        contrast:
          corePlugins.backdropContrast && config.mapping.backdropContrast,
        grayscale:
          corePlugins.backdropGrayscale && config.mapping.backdropGrayscale,
        'hue-rotate':
          corePlugins.backdropHueRotate && config.mapping.backdropHueRotate,
        invert: corePlugins.backdropInvert && config.mapping.backdropInvert,
        opacity: corePlugins.backdropOpacity && config.mapping.backdropOpacity,
        saturate:
          corePlugins.backdropSaturate && config.mapping.backdropSaturate,
        sepia: corePlugins.backdropSepia && config.mapping.backdropSepia,
      };

    return convertFilterFunctions(
      declaration.value,
      BACKDROP_FILTER_FUNCTIONS_ORDER,
      name => mappings[name],
      name => `backdrop-${name}`,
      config.remInPx
    );
  },

  'background-attachment': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundAttachment
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['background-attachment']
        )
      : [],

  'background-blend-mode': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundBlendMode
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['background-blend-mode']
        )
      : [],

  'background-clip': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundClip
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['background-clip']
        )
      : [],

  'background-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.backgroundColor,
          'bg',
          'color'
        )
      : [],

  'background-image': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundImage
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.backgroundImage,
          'bg',
          declaration.value,
          'bg',
          'image'
        )
      : [],

  'background-origin': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundOrigin
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['background-origin']
        )
      : [],

  'background-position': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundPosition
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.backgroundPosition,
          'bg',
          declaration.value,
          'bg',
          'position',
          true
        )
      : [],

  'background-repeat': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundRepeat
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['background-repeat']
        )
      : [],

  'background-size': (declaration, config) =>
    config.tailwindConfig.corePlugins.backgroundSize
      ? convertDeclarationValue(
          normalizeSizeValue(declaration.value, config.remInPx),
          config.mapping.backgroundSize,
          'bg',
          declaration.value,
          'bg',
          'length',
          true
        )
      : [],

  border: (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['border'](declaration, config)
    ),

  'border-bottom': (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['border-bottom'](
        declaration,
        config
      )
    ),

  'border-bottom-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.borderColor,
          'border-b',
          'color'
        )
      : [],

  'border-bottom-left-radius': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderRadius
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderRadius,
          'rounded-bl',
          config.remInPx
        )
      : [],

  'border-bottom-right-radius': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderRadius
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderRadius,
          'rounded-br',
          config.remInPx
        )
      : [],

  // 'border-bottom-style': (declaration, config) =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-bottom-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderWidth,
          'border-b',
          config.remInPx,
          false,
          'length'
        )
      : [],

  'border-collapse': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderCollapse
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['border-collapse']
        )
      : [],

  'border-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.borderColor,
          'border',
          'color'
        )
      : [],

  'border-left': (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['border-left'](
        declaration,
        config
      )
    ),

  'border-left-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.borderColor,
          'border-l',
          'color'
        )
      : [],

  // 'border-left-style': (declaration, config) =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-left-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderWidth,
          'border-l',
          config.remInPx,
          false,
          'length'
        )
      : [],

  'border-radius': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderRadius
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderRadius,
          'rounded',
          config.remInPx
        )
      : [],

  'border-right': (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['border-right'](
        declaration,
        config
      )
    ),

  'border-right-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.borderColor,
          'border-r',
          'color'
        )
      : [],

  // 'border-right-style': (declaration, config) =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-right-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderWidth,
          'border-r',
          config.remInPx,
          false,
          'length'
        )
      : [],

  'border-spacing': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderSpacing
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderSpacing,
          'border-spacing',
          config.remInPx
        )
      : [],

  'border-style': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderStyle
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['border-style']
        )
      : [],

  'border-top': (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['border-top'](
        declaration,
        config
      )
    ),

  'border-top-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.borderColor,
          'border-t',
          'color'
        )
      : [],

  'border-top-left-radius': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderRadius
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderRadius,
          'rounded-tl',
          config.remInPx
        )
      : [],

  'border-top-right-radius': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderRadius
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderRadius,
          'rounded-tr',
          config.remInPx
        )
      : [],

  // 'border-top-style': (declaration, config) =>
  //   strictConvertDeclarationValue(declaration.value, UTILITIES_MAPPING['border-style']),

  'border-top-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.borderWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.borderWidth,
          'border-t',
          config.remInPx,
          false,
          'length'
        )
      : [],

  'border-width': (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['border-width'](
        declaration,
        config
      )
    ),

  bottom: (declaration, config) =>
    config.tailwindConfig.corePlugins.inset
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.inset,
          'bottom',
          config.remInPx,
          true
        )
      : [],

  'box-decoration-break': (declaration, config) =>
    config.tailwindConfig.corePlugins.boxDecorationBreak
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['box-decoration-break']
        )
      : [],

  'box-shadow': (declaration, config) =>
    config.tailwindConfig.corePlugins.boxShadow
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.boxShadow,
          'shadow',
          declaration.value,
          'shadow',
          // without the hint `shadow-[var(--x)]` sets the shadow color
          'shadow'
        )
      : [],

  'box-sizing': (declaration, config) =>
    config.tailwindConfig.corePlugins.boxSizing
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['box-sizing']
        )
      : [],

  'break-after': (declaration, config) =>
    config.tailwindConfig.corePlugins.breakAfter
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['break-after']
        )
      : [],

  'break-before': (declaration, config) =>
    config.tailwindConfig.corePlugins.breakBefore
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['break-before']
        )
      : [],

  'break-inside': (declaration, config) =>
    config.tailwindConfig.corePlugins.breakInside
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['break-inside']
        )
      : [],

  'caret-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.caretColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.caretColor,
          'caret',
          'color'
        )
      : [],

  clear: (declaration, config) =>
    config.tailwindConfig.corePlugins.clear
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['clear']
        )
      : [],

  color: (declaration, config) =>
    config.tailwindConfig.corePlugins.textColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.textColor,
          'text',
          'color'
        )
      : [],

  'column-gap': (declaration, config) =>
    config.tailwindConfig.corePlugins.gap
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.gap,
          'gap-x',
          config.remInPx
        )
      : [],

  columns: (declaration, config) =>
    config.tailwindConfig.corePlugins.columns
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.columns,
          'columns',
          config.remInPx
        )
      : [],

  content: (declaration, config) =>
    config.tailwindConfig.corePlugins.content
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.content,
          'content'
        )
      : [],

  cursor: (declaration, config) =>
    config.tailwindConfig.corePlugins.cursor
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.cursor,
          'cursor'
        )
      : [],

  display: (declaration, config) =>
    config.tailwindConfig.corePlugins.display
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['display']
        )
      : [],

  fill: (declaration, config) =>
    config.tailwindConfig.corePlugins.fill
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.fill,
          'fill'
        )
      : [],

  filter: (declaration, config) => {
    const { corePlugins } = config.tailwindConfig;

    if (!corePlugins.filter) {
      return [];
    }

    if (declaration.value.trim().toLowerCase() === 'none') {
      return ['filter-none'];
    }

    if (config.strict) {
      // the utilities of filter functions compose with the ones set by other rules
      return [];
    }

    const mappings: Record<string, Record<string, string> | undefined | false> =
      {
        blur: corePlugins.blur && config.mapping.blur,
        brightness: corePlugins.brightness && config.mapping.brightness,
        contrast: corePlugins.contrast && config.mapping.contrast,
        grayscale: corePlugins.grayscale && config.mapping.grayscale,
        'hue-rotate': corePlugins.hueRotate && config.mapping.hueRotate,
        invert: corePlugins.invert && config.mapping.invert,
        saturate: corePlugins.saturate && config.mapping.saturate,
        sepia: corePlugins.sepia && config.mapping.sepia,
        'drop-shadow': corePlugins.dropShadow && config.mapping.dropShadow,
      };

    return convertFilterFunctions(
      declaration.value,
      FILTER_FUNCTIONS_ORDER,
      name => mappings[name],
      name => name,
      config.remInPx
    );
  },

  flex: (declaration, config) =>
    config.tailwindConfig.corePlugins.flex
      ? convertDeclarationValue(
          expandFlexValue(declaration.value),
          expandedFlexMapping(config.mapping.flex),
          'flex',
          declaration.value
        )
      : [],

  'flex-basis': (declaration, config) =>
    config.tailwindConfig.corePlugins.flexBasis
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.flexBasis,
          'basis',
          config.remInPx
        )
      : [],

  'flex-direction': (declaration, config) =>
    config.tailwindConfig.corePlugins.flexDirection
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['flex-direction']
        )
      : [],

  'flex-grow': (declaration, config) =>
    config.tailwindConfig.corePlugins.flexGrow
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.flexGrow,
          'grow'
        )
      : [],

  'flex-shrink': (declaration, config) =>
    config.tailwindConfig.corePlugins.flexShrink
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.flexShrink,
          'shrink'
        )
      : [],

  'flex-wrap': (declaration, config) =>
    config.tailwindConfig.corePlugins.flexWrap
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['flex-wrap']
        )
      : [],

  float: (declaration, config) =>
    config.tailwindConfig.corePlugins.float
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['float']
        )
      : [],

  'font-size': (declaration, config) => {
    if (!config.tailwindConfig.corePlugins.fontSize) {
      return [];
    }

    // Theme font sizes may also set line-height, letter-spacing and font-weight
    return config.strict
      ? convertDeclarationValue(
          declaration.value,
          {},
          'text',
          declaration.value,
          'text',
          'length',
          true
        )
      : convertSizeDeclarationValue(
          declaration.value,
          config.mapping.fontSize,
          'text',
          config.remInPx,
          false,
          'length'
        );
  },

  'font-smoothing': (declaration, config) =>
    config.tailwindConfig.corePlugins.fontSmoothing
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['font-smoothing']
        )
      : [],

  'font-style': (declaration, config) =>
    config.tailwindConfig.corePlugins.fontStyle
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['font-style']
        )
      : [],

  'font-variant-numeric': (declaration, config) =>
    config.tailwindConfig.corePlugins.fontVariantNumeric
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['font-variant-numeric']
        )
      : [],

  'font-weight': (declaration, config) => {
    if (!config.tailwindConfig.corePlugins.fontWeight) {
      return [];
    }

    const value = declaration.value.trim();
    const normalizedValue =
      getOwn(FONT_WEIGHT_KEYWORDS, value.toLowerCase()) || value;

    return convertDeclarationValue(
      normalizedValue,
      config.mapping.fontWeight,
      'font',
      value,
      'font',
      'number',
      // Without a type hint Tailwind treats keywords (e.g. `bolder`) as a font family
      !/^\d+$/.test(value)
    );
  },

  gap: (declaration, config) =>
    config.tailwindConfig.corePlugins.gap
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.gap,
          'gap',
          config.remInPx
        )
      : [],

  'grid-auto-columns': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridAutoColumns
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridAutoColumns,
          'auto-cols'
        )
      : [],

  'grid-auto-flow': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridAutoFlow
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['grid-auto-flow']
        )
      : [],

  'grid-auto-rows': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridAutoRows
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridAutoRows,
          'auto-rows'
        )
      : [],

  'grid-column': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridColumn
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridColumn,
          'col'
        )
      : [],

  'grid-column-end': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridColumnEnd
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridColumnEnd,
          'col-end'
        )
      : [],

  'grid-column-gap': (declaration, config) =>
    config.tailwindConfig.corePlugins.gap
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.gap,
          'gap-x',
          config.remInPx
        )
      : [],

  'grid-column-start': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridColumnStart
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridColumnStart,
          'col-start'
        )
      : [],

  'grid-gap': (declaration, config) =>
    config.tailwindConfig.corePlugins.gap
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.gap,
          'gap',
          config.remInPx
        )
      : [],

  'grid-row': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridRow
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridRow,
          'row'
        )
      : [],

  'grid-row-end': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridRowEnd
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridRowEnd,
          'row-end'
        )
      : [],

  'grid-row-gap': (declaration, config) =>
    config.tailwindConfig.corePlugins.gap
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.gap,
          'gap-y',
          config.remInPx
        )
      : [],

  'grid-row-start': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridRowStart
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridRowStart,
          'row-start'
        )
      : [],

  'grid-template-columns': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridTemplateColumns
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridTemplateColumns,
          'grid-cols'
        )
      : [],

  'grid-template-rows': (declaration, config) =>
    config.tailwindConfig.corePlugins.gridTemplateRows
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.gridTemplateRows,
          'grid-rows'
        )
      : [],

  height: (declaration, config) =>
    config.tailwindConfig.corePlugins.height
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.height,
          'h',
          config.remInPx
        )
      : [],

  inset: (declaration, config) =>
    config.tailwindConfig.corePlugins.inset
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.inset,
          'inset',
          config.remInPx,
          true
        )
      : [],

  isolation: (declaration, config) =>
    config.tailwindConfig.corePlugins.isolation
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['isolation']
        )
      : [],

  'justify-content': (declaration, config) =>
    config.tailwindConfig.corePlugins.justifyContent
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['justify-content']
        )
      : [],

  'justify-items': (declaration, config) =>
    config.tailwindConfig.corePlugins.justifyItems
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['justify-items']
        )
      : [],

  'justify-self': (declaration, config) =>
    config.tailwindConfig.corePlugins.justifySelf
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['justify-self']
        )
      : [],

  left: (declaration, config) =>
    config.tailwindConfig.corePlugins.inset
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.inset,
          'left',
          config.remInPx,
          true
        )
      : [],

  'letter-spacing': (declaration, config) =>
    config.tailwindConfig.corePlugins.letterSpacing
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.letterSpacing,
          'tracking',
          config.remInPx,
          true
        )
      : [],

  'line-height': (declaration, config) =>
    config.tailwindConfig.corePlugins.lineHeight
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.lineHeight,
          'leading',
          config.remInPx
        )
      : [],

  'list-style-position': (declaration, config) =>
    config.tailwindConfig.corePlugins.listStylePosition
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['list-style-position']
        )
      : [],

  'list-style-type': (declaration, config) =>
    config.tailwindConfig.corePlugins.listStyleType
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.listStyleType,
          'list'
        )
      : [],

  margin: (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['margin'](declaration, config)
    ),

  'margin-bottom': (declaration, config) =>
    config.tailwindConfig.corePlugins.margin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.margin,
          'mb',
          config.remInPx,
          true
        )
      : [],

  'margin-left': (declaration, config) =>
    config.tailwindConfig.corePlugins.margin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.margin,
          'ml',
          config.remInPx,
          true
        )
      : [],

  'margin-right': (declaration, config) =>
    config.tailwindConfig.corePlugins.margin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.margin,
          'mr',
          config.remInPx,
          true
        )
      : [],

  'margin-top': (declaration, config) =>
    config.tailwindConfig.corePlugins.margin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.margin,
          'mt',
          config.remInPx,
          true
        )
      : [],

  'max-height': (declaration, config) =>
    config.tailwindConfig.corePlugins.maxHeight
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.maxHeight,
          'max-h',
          config.remInPx
        )
      : [],

  'max-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.maxWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.maxWidth,
          'max-w',
          config.remInPx
        )
      : [],

  'min-height': (declaration, config) =>
    config.tailwindConfig.corePlugins.minHeight
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.minHeight,
          'min-h',
          config.remInPx
        )
      : [],

  'min-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.minWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.minWidth,
          'min-w',
          config.remInPx
        )
      : [],

  'mix-blend-mode': (declaration, config) =>
    config.tailwindConfig.corePlugins.mixBlendMode
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['mix-blend-mode']
        )
      : [],

  'object-fit': (declaration, config) =>
    config.tailwindConfig.corePlugins.objectFit
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['object-fit']
        )
      : [],

  'object-position': (declaration, config) =>
    config.tailwindConfig.corePlugins.objectPosition
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.objectPosition,
          'object'
        )
      : [],

  opacity: (declaration, config) => {
    if (!config.tailwindConfig.corePlugins.opacity) {
      return [];
    }

    const value = declaration.value.trim();
    const percentage = value.match(/^(\d*\.?\d+)%$/);

    return convertDeclarationValue(
      percentage ? `${parseFloat(percentage[1]) / 100}` : value,
      config.mapping.opacity,
      'opacity',
      value
    );
  },

  order: (declaration, config) =>
    config.tailwindConfig.corePlugins.order
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.order,
          'order',
          null,
          true
        )
      : [],

  outline: (declaration, config) =>
    // `outline-none` also sets `outline-offset`
    config.tailwindConfig.corePlugins.outlineStyle && !config.strict
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['outline']
        )
      : [],

  'outline-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.outlineColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.outlineColor,
          'outline',
          'color'
        )
      : [],

  'outline-offset': (declaration, config) =>
    config.tailwindConfig.corePlugins.outlineOffset
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.outlineOffset,
          'outline-offset',
          config.remInPx,
          true,
          'length'
        )
      : [],

  'outline-style': (declaration, config) =>
    config.tailwindConfig.corePlugins.outlineStyle
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['outline-style']
        )
      : [],

  'outline-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.outlineWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.outlineWidth,
          'outline',
          config.remInPx,
          false,
          'length'
        )
      : [],

  overflow: (declaration, config) =>
    config.tailwindConfig.corePlugins.overflow
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['overflow']
        )
      : [],

  'overflow-wrap': (declaration, config) =>
    config.tailwindConfig.corePlugins.wordBreak
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['overflow-wrap']
        )
      : [],

  'overflow-x': (declaration, config) =>
    config.tailwindConfig.corePlugins.overflow
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['overflow-x']
        )
      : [],

  'overflow-y': (declaration, config) =>
    config.tailwindConfig.corePlugins.overflow
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['overflow-y']
        )
      : [],

  'overscroll-behavior': (declaration, config) =>
    config.tailwindConfig.corePlugins.overscrollBehavior
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['overscroll-behavior']
        )
      : [],
  'overscroll-behavior-x': (declaration, config) =>
    config.tailwindConfig.corePlugins.overscrollBehavior
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['overscroll-behavior-x']
        )
      : [],
  'overscroll-behavior-y': (declaration, config) =>
    config.tailwindConfig.corePlugins.overscrollBehavior
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['overscroll-behavior-y']
        )
      : [],

  padding: (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['padding'](declaration, config)
    ),

  'padding-bottom': (declaration, config) =>
    config.tailwindConfig.corePlugins.padding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.padding,
          'pb',
          config.remInPx
        )
      : [],

  'padding-left': (declaration, config) =>
    config.tailwindConfig.corePlugins.padding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.padding,
          'pl',
          config.remInPx
        )
      : [],

  'padding-right': (declaration, config) =>
    config.tailwindConfig.corePlugins.padding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.padding,
          'pr',
          config.remInPx
        )
      : [],

  'padding-top': (declaration, config) =>
    config.tailwindConfig.corePlugins.padding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.padding,
          'pt',
          config.remInPx
        )
      : [],

  'page-break-after': (declaration, config) =>
    config.tailwindConfig.corePlugins.breakAfter
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['break-after']
        )
      : [],

  'page-break-before': (declaration, config) =>
    config.tailwindConfig.corePlugins.breakBefore
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['break-before']
        )
      : [],

  'page-break-inside': (declaration, config) =>
    config.tailwindConfig.corePlugins.breakInside
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['break-inside']
        )
      : [],

  'place-content': (declaration, config) =>
    config.tailwindConfig.corePlugins.placeContent
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['place-content']
        )
      : [],

  'place-items': (declaration, config) =>
    config.tailwindConfig.corePlugins.placeItems
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['place-items']
        )
      : [],

  'place-self': (declaration, config) =>
    config.tailwindConfig.corePlugins.placeSelf
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['place-self']
        )
      : [],

  'pointer-events': (declaration, config) =>
    config.tailwindConfig.corePlugins.pointerEvents
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['pointer-events']
        )
      : [],

  position: (declaration, config) =>
    config.tailwindConfig.corePlugins.position
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['position']
        )
      : [],

  resize: (declaration, config) =>
    config.tailwindConfig.corePlugins.resize
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['resize']
        )
      : [],

  right: (declaration, config) =>
    config.tailwindConfig.corePlugins.inset
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.inset,
          'right',
          config.remInPx,
          true
        )
      : [],

  'row-gap': (declaration, config) =>
    config.tailwindConfig.corePlugins.gap
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.gap,
          'gap-y',
          config.remInPx
        )
      : [],

  'scroll-behavior': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollBehavior
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['scroll-behavior']
        )
      : [],

  'scroll-margin': (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['scroll-margin'](
        declaration,
        config
      )
    ),

  'scroll-margin-bottom': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollMargin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollMargin,
          'scroll-mb',
          config.remInPx,
          true
        )
      : [],

  'scroll-margin-left': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollMargin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollMargin,
          'scroll-ml',
          config.remInPx,
          true
        )
      : [],

  'scroll-margin-right': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollMargin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollMargin,
          'scroll-mr',
          config.remInPx,
          true
        )
      : [],

  'scroll-margin-top': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollMargin
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollMargin,
          'scroll-mt',
          config.remInPx,
          true
        )
      : [],

  'scroll-padding': (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['scroll-padding'](
        declaration,
        config
      )
    ),

  'scroll-padding-bottom': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollPadding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollPadding,
          'scroll-pb',
          config.remInPx
        )
      : [],

  'scroll-padding-left': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollPadding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollPadding,
          'scroll-pl',
          config.remInPx
        )
      : [],

  'scroll-padding-right': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollPadding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollPadding,
          'scroll-pr',
          config.remInPx
        )
      : [],

  'scroll-padding-top': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollPadding
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.scrollPadding,
          'scroll-pt',
          config.remInPx
        )
      : [],

  'scroll-snap-align': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollSnapAlign
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['scroll-snap-align']
        )
      : [],

  'scroll-snap-type': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollSnapType
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['scroll-snap-type']
        )
      : [],

  'scroll-snap-stop': (declaration, config) =>
    config.tailwindConfig.corePlugins.scrollSnapStop
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['scroll-snap-stop']
        )
      : [],

  stroke: (declaration, config) =>
    config.tailwindConfig.corePlugins.stroke
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.stroke,
          'stroke',
          'color'
        )
      : [],

  'stroke-width': (declaration, config) =>
    config.tailwindConfig.corePlugins.strokeWidth
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.strokeWidth,
          'stroke',
          config.remInPx,
          false,
          'length'
        )
      : [],

  'table-layout': (declaration, config) =>
    config.tailwindConfig.corePlugins.tableLayout
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['table-layout']
        )
      : [],

  'text-align': (declaration, config) =>
    config.tailwindConfig.corePlugins.textAlign
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['text-align']
        )
      : [],

  'text-decoration': (declaration, config) => {
    if (!config.tailwindConfig.corePlugins.textDecoration) {
      return [];
    }

    // the shorthand also resets the style, the color and the thickness of the line
    if (config.strict) {
      return [];
    }

    const parsed = splitBySpaces(declaration.value);
    return parsed.length === 1
      ? strictConvertDeclarationValue(
          parsed[0],
          UTILITIES_MAPPING['text-decoration-line']
        )
      : [];
  },

  'text-decoration-color': (declaration, config) =>
    config.tailwindConfig.corePlugins.textDecorationColor
      ? convertColorDeclarationValue(
          declaration.value,
          config.mapping.textDecorationColor,
          'decoration',
          'color'
        )
      : [],

  'text-decoration-line': (declaration, config) =>
    config.tailwindConfig.corePlugins.textDecoration
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['text-decoration-line']
        )
      : [],

  'text-decoration-style': (declaration, config) =>
    config.tailwindConfig.corePlugins.textDecorationStyle
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['text-decoration-style']
        )
      : [],

  'text-decoration-thickness': (declaration, config) =>
    config.tailwindConfig.corePlugins.textDecorationThickness
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.textDecorationThickness,
          'decoration',
          config.remInPx,
          false,
          'length'
        )
      : [],

  'text-indent': (declaration, config) =>
    config.tailwindConfig.corePlugins.textIndent
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.textIndent,
          'indent',
          config.remInPx,
          true
        )
      : [],

  'text-overflow': (declaration, config) =>
    config.tailwindConfig.corePlugins.textOverflow
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['text-overflow']
        )
      : [],

  'text-transform': (declaration, config) =>
    config.tailwindConfig.corePlugins.textTransform
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['text-transform']
        )
      : [],

  'text-underline-offset': (declaration, config) =>
    config.tailwindConfig.corePlugins.textUnderlineOffset
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.textUnderlineOffset,
          'underline-offset',
          config.remInPx,
          false,
          'length'
        )
      : [],

  top: (declaration, config) =>
    config.tailwindConfig.corePlugins.inset
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.inset,
          'top',
          config.remInPx,
          true
        )
      : [],

  'touch-action': (declaration, config) =>
    config.tailwindConfig.corePlugins.touchAction
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['touch-action']
        )
      : [],

  transform: (declaration, config) =>
    config.tailwindConfig.corePlugins.transform
      ? convertTransformDeclarationValue(declaration.value, config)
      : [],

  'transform-origin': (declaration, config) =>
    config.tailwindConfig.corePlugins.transformOrigin
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.transformOrigin,
          'origin'
        )
      : [],

  transition: (declaration, config) =>
    toClassNames(
      DECLARATION_UTILITIES_CONVERTERS_MAPPING['transition'](
        declaration,
        config
      )
    ),

  'transition-delay': (declaration, config) =>
    config.tailwindConfig.corePlugins.transitionDelay
      ? convertDeclarationValue(
          normalizeTimeValue(declaration.value),
          config.mapping.transitionDelay,
          'delay',
          declaration.value
        )
      : [],

  'transition-duration': (declaration, config) =>
    config.tailwindConfig.corePlugins.transitionDuration
      ? convertDeclarationValue(
          normalizeTimeValue(declaration.value),
          config.mapping.transitionDuration,
          'duration',
          declaration.value
        )
      : [],

  'transition-property': (declaration, config) =>
    // Tailwind's transition-property utilities also set a duration and a timing function
    config.tailwindConfig.corePlugins.transitionProperty && !config.strict
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.transitionProperty,
          'transition'
        )
      : [],

  'transition-timing-function': (declaration, config) =>
    config.tailwindConfig.corePlugins.transitionTimingFunction
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.transitionTimingFunction,
          'ease'
        )
      : [],

  'user-select': (declaration, config) =>
    config.tailwindConfig.corePlugins.userSelect
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['user-select']
        )
      : [],

  'vertical-align': (declaration, config) =>
    config.tailwindConfig.corePlugins.verticalAlign
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['vertical-align']
        )
      : [],

  visibility: (declaration, config) =>
    config.tailwindConfig.corePlugins.visibility
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['visibility']
        )
      : [],

  'white-space': (declaration, config) =>
    config.tailwindConfig.corePlugins.whitespace
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['white-space']
        )
      : [],

  width: (declaration, config) =>
    config.tailwindConfig.corePlugins.width
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.width,
          'w',
          config.remInPx
        )
      : [],

  'will-change': (declaration, config) =>
    config.tailwindConfig.corePlugins.willChange
      ? convertDeclarationValue(
          declaration.value,
          config.mapping.willChange,
          'will-change'
        )
      : [],

  'word-break': (declaration, config) =>
    config.tailwindConfig.corePlugins.wordBreak
      ? strictConvertDeclarationValue(
          declaration.value,
          UTILITIES_MAPPING['word-break']
        )
      : [],

  'z-index': (declaration, config) =>
    config.tailwindConfig.corePlugins.zIndex
      ? convertSizeDeclarationValue(
          declaration.value,
          config.mapping.zIndex,
          'z',
          null,
          true
        )
      : [],
};
