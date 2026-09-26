const cssFunctionRegexp = /(?<name>[\w-]+)\((?<value>.*?)\)/;

/**
 * @deprecated Doesn't support nested functions, use `parseFunctionList` from `core/values`.
 */
export function parseCSSFunction(string: string) {
  const { name, value } = string.match(cssFunctionRegexp)?.groups || {};

  return { name: name || null, value: value || null };
}
