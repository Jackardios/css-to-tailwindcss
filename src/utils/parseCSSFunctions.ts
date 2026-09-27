import { parseCSSFunction } from './parseCSSFunction';

const cssFunctionRegexp = /(?<name>[\w-]+)\((?<value>.*?)\)/gm;

/**
 * @deprecated Not used by the converter since 1.1, doesn't support nested functions.
 */
export function parseCSSFunctions(value: string) {
  return (
    value
      .trim()
      .match(cssFunctionRegexp)
      ?.map((cssFunction: string) => {
        return parseCSSFunction(cssFunction);
      }) || []
  );
}
