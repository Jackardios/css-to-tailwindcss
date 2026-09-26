import type { Config } from 'tailwindcss';

import {
  TailwindConverter,
  TailwindConverterConfig,
} from '../../src/TailwindConverter';
import { expectValidConversion } from './tailwind';

/**
 * Collapses formatting differences, so that the expected CSS can be written on one line.
 */
export function normalizeCSS(css: string) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/**
 * Converts the CSS, checks that every produced class exists in Tailwind and returns the normalized output.
 */
export async function convert(
  css: string,
  config: Partial<TailwindConverterConfig> = {}
) {
  const converter = new TailwindConverter({
    remInPx: 16,
    ...config,
    tailwindConfig: {
      content: [],
      ...(config.tailwindConfig || {}),
    } as Config,
  });
  const result = await converter.convertCSS(css);

  await expectValidConversion(result, config.tailwindConfig);

  return normalizeCSS(result.convertedRoot.toString());
}
