import { parseCSSFunction } from './parseCSSFunction';

const cssFunctionRegexp = /(?<name>[\w-]+)\((?<value>.*?)\)/gm;

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
