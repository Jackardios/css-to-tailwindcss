const numberStartsWithDotRegexp = /^\.[0-9]/;

export function normalizeNumberValue(value: string) {
  if (numberStartsWithDotRegexp.test(value.trim())) {
    return `0${value}`;
  }

  return value;
}
