import { getOwn } from './getOwn';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

const FONT_VARIANT_LONGHANDS = [
  'font-variant-caps',
  'font-variant-numeric',
  'font-variant-ligatures',
  'font-variant-east-asian',
  'font-variant-alternates',
  'font-variant-position',
  'font-variant-emoji',
];

const BORDER_IMAGE_LONGHANDS = [
  'border-image-source',
  'border-image-slice',
  'border-image-width',
  'border-image-outset',
  'border-image-repeat',
];

/** Matches any property, used for the `all` shorthand. */
export const ANY_PROPERTY = '*';

function sides(prefix: string, suffix = '') {
  return SIDES.map(side => `${prefix}-${side}${suffix}`);
}

function borderSide(side: string) {
  return [
    `border-${side}-width`,
    `border-${side}-style`,
    `border-${side}-color`,
  ];
}

function logical(prefix: string, suffix = '') {
  return [
    `${prefix}-inline-start${suffix}`,
    `${prefix}-inline-end${suffix}`,
    `${prefix}-block-start${suffix}`,
    `${prefix}-block-end${suffix}`,
  ];
}

/**
 * Longhand properties set by shorthand properties.
 * Physical shorthands also list the logical longhands, since those may alias any of their sides.
 * This table must be exact for shorthands that the converter converts and may be an over-approximation
 * for the ones it doesn't (they are only used to detect overlapping declarations).
 */
const SHORTHAND_LONGHANDS: Record<string, string[]> = {
  all: [ANY_PROPERTY],

  margin: [...sides('margin'), ...logical('margin')],
  padding: [...sides('padding'), ...logical('padding')],
  'scroll-margin': [...sides('scroll-margin'), ...logical('scroll-margin')],
  'scroll-padding': [...sides('scroll-padding'), ...logical('scroll-padding')],
  inset: [...SIDES, ...logical('inset')],

  border: [
    ...BORDER_IMAGE_LONGHANDS,
    ...sides('border', '-width'),
    ...sides('border', '-style'),
    ...sides('border', '-color'),
    ...logical('border', '-width'),
    ...logical('border', '-style'),
    ...logical('border', '-color'),
  ],
  'border-top': borderSide('top'),
  'border-right': borderSide('right'),
  'border-bottom': borderSide('bottom'),
  'border-left': borderSide('left'),
  'border-width': [
    ...sides('border', '-width'),
    ...logical('border', '-width'),
  ],
  'border-style': [
    ...sides('border', '-style'),
    ...logical('border', '-style'),
  ],
  'border-color': [
    ...sides('border', '-color'),
    ...logical('border', '-color'),
  ],
  'border-radius': CORNERS.map(corner => `border-${corner}-radius`),

  gap: ['row-gap', 'column-gap'],
  'grid-gap': ['row-gap', 'column-gap'],
  'grid-row-gap': ['row-gap'],
  'grid-column-gap': ['column-gap'],

  overflow: ['overflow-x', 'overflow-y'],
  'overscroll-behavior': ['overscroll-behavior-x', 'overscroll-behavior-y'],

  transition: [
    'transition-property',
    'transition-duration',
    'transition-timing-function',
    'transition-delay',
    'transition-behavior',
  ],
  animation: [
    'animation-name',
    'animation-duration',
    'animation-timing-function',
    'animation-delay',
    'animation-iteration-count',
    'animation-direction',
    'animation-fill-mode',
    'animation-play-state',
    'animation-timeline',
    'animation-composition',
    'animation-range-start',
    'animation-range-end',
  ],
  'animation-range': ['animation-range-start', 'animation-range-end'],

  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  'place-content': ['align-content', 'justify-content'],
  'place-items': ['align-items', 'justify-items'],
  'place-self': ['align-self', 'justify-self'],

  'grid-column': ['grid-column-start', 'grid-column-end'],
  'grid-row': ['grid-row-start', 'grid-row-end'],
  'grid-area': [
    'grid-row-start',
    'grid-column-start',
    'grid-row-end',
    'grid-column-end',
  ],
  'grid-template': [
    'grid-template-rows',
    'grid-template-columns',
    'grid-template-areas',
  ],
  grid: [
    'grid-template-rows',
    'grid-template-columns',
    'grid-template-areas',
    'grid-auto-rows',
    'grid-auto-columns',
    'grid-auto-flow',
  ],

  outline: ['outline-width', 'outline-style', 'outline-color'],
  'text-decoration': [
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-color',
    'text-decoration-thickness',
  ],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  columns: ['column-width', 'column-count'],
  background: [
    'background-color',
    'background-image',
    'background-position-x',
    'background-position-y',
    'background-size',
    'background-repeat',
    'background-origin',
    'background-clip',
    'background-attachment',
  ],
  'background-position': ['background-position-x', 'background-position-y'],
  font: [
    'font-style',
    ...FONT_VARIANT_LONGHANDS,
    'font-weight',
    'font-stretch',
    'font-size',
    'line-height',
    'font-family',
    'font-size-adjust',
    'font-kerning',
    'font-optical-sizing',
    'font-variation-settings',
    'font-language-override',
  ],
  'font-variant': FONT_VARIANT_LONGHANDS,
  'font-synthesis': [
    'font-synthesis-weight',
    'font-synthesis-style',
    'font-synthesis-small-caps',
    'font-synthesis-position',
  ],
  'white-space': ['white-space-collapse', 'text-wrap-mode'],
  'text-wrap': ['text-wrap-mode', 'text-wrap-style'],
  'border-image': BORDER_IMAGE_LONGHANDS,

  'page-break-after': ['break-after'],
  'page-break-before': ['break-before'],
  'page-break-inside': ['break-inside'],
  'word-wrap': ['overflow-wrap'],
};

const LOGICAL_PROPERTY_REGEXP =
  /^(margin|padding|scroll-margin|scroll-padding|inset|border)-(inline|block)(-start|-end)?(-width|-style|-color)?$/;
const LOGICAL_RADIUS_REGEXP = /^border-(start|end)-(start|end)-radius$/;

/**
 * Logical properties alias physical ones depending on the direction and the writing mode
 * (e.g. `margin-inline-start` is `margin-top` with `writing-mode: vertical-lr`),
 * so they are treated as overlapping with every physical side.
 */
function logicalLonghandsOf(property: string): string[] | null {
  if (LOGICAL_RADIUS_REGEXP.test(property)) {
    return [property, ...SHORTHAND_LONGHANDS['border-radius']];
  }

  const match = property.match(LOGICAL_PROPERTY_REGEXP);
  if (!match) {
    return null;
  }

  const [, prefix, axis, edge, suffix = ''] = match;
  const physicalSides = SIDES as readonly string[];
  const physical = physicalSides.map(side =>
    prefix === 'inset' ? side : `${prefix}-${side}${suffix}`
  );
  const logicalEdges = edge
    ? [property]
    : [`${prefix}-${axis}-start${suffix}`, `${prefix}-${axis}-end${suffix}`];

  if (prefix === 'border' && !suffix) {
    const result = [...logicalEdges];
    ['-width', '-style', '-color'].forEach(part => {
      physicalSides.forEach(side => result.push(`border-${side}${part}`));
    });

    return result;
  }

  return [...logicalEdges, ...physical];
}

export function longhandsOf(property: string): string[] {
  const normalized = property.toLowerCase();

  return (
    getOwn(SHORTHAND_LONGHANDS, normalized) ||
    logicalLonghandsOf(normalized) || [normalized]
  );
}

function isLogicalProperty(property: string) {
  return (
    LOGICAL_PROPERTY_REGEXP.test(property) ||
    LOGICAL_RADIUS_REGEXP.test(property)
  );
}

/**
 * Longhand properties that the property sets regardless of the direction and the writing mode:
 * unlike `longhandsOf`, logical properties are not mapped to physical ones.
 */
export function definiteLonghandsOf(property: string): string[] {
  const normalized = property.toLowerCase();

  const shorthandLonghands = getOwn(SHORTHAND_LONGHANDS, normalized);

  if (shorthandLonghands) {
    return shorthandLonghands;
  }

  return isLogicalProperty(normalized)
    ? (logicalLonghandsOf(normalized) || []).filter(isLogicalProperty)
    : [normalized];
}

export function propertiesIntersect(
  a: Iterable<string>,
  b: Iterable<string>
): boolean {
  const setB = b instanceof Set ? (b as Set<string>) : new Set(b);

  if (setB.has(ANY_PROPERTY)) {
    return true;
  }

  for (const property of a) {
    if (property === ANY_PROPERTY || setB.has(property)) {
      return true;
    }
  }

  return false;
}

export function isPropertySubset(
  subset: Iterable<string>,
  superset: Iterable<string>
): boolean {
  const setB =
    superset instanceof Set ? (superset as Set<string>) : new Set(superset);

  if (setB.has(ANY_PROPERTY)) {
    return true;
  }

  for (const property of subset) {
    if (!setB.has(property)) {
      return false;
    }
  }

  return true;
}
