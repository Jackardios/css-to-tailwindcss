const cssFunctionRegexp = /(?<name>[\w-]+)\((?<value>.*)\)/;

export function parseCSSFunction(string: string) {
  const { name, value } = string.match(cssFunctionRegexp)?.groups || {};

  return { name: name || null, value: value || null };
}
