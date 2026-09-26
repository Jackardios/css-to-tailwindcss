import { parseCSSFunction } from './parseCSSFunction';

const cssFunctionRegexp = /(?<name>[\w-]+)\((?<value>.*?)\)/gm;

/**
 * @deprecated Doesn't support nested functions, use `parseFunctionList` from `core/values`.
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
