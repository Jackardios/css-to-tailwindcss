const cssFunctionRegexp = /(?<name>[\w-]+)\((?<value>.*?)\)/;

/**
 * @deprecated Not used by the converter since 1.1, doesn't support nested functions.
 */
export function parseCSSFunction(string: string) {
  const { name, value } = string.match(cssFunctionRegexp)?.groups || {};

  return { name: name || null, value: value || null };
}
