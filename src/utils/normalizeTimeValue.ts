const TIME_REGEXP = /^[+-]?(\d*\.)?\d+(m?s)$/i;

export function isTimeValue(value: string) {
  return TIME_REGEXP.test(value.trim());
}

/** Converts `0.3s` to `300ms` so that equal durations match regardless of the unit. */
export function normalizeTimeValue(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(TIME_REGEXP);

  if (!match || match[2].toLowerCase() !== 's') {
    return trimmed;
  }

  return `${Math.round(parseFloat(trimmed) * 100000) / 100}ms`;
}
