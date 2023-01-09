export function remValueToPx(value: string, remInPx: number) {
  if (value.trim().endsWith('rem')) {
    const number = parseFloat(value);

    return isNaN(number) ? value : `${number * remInPx}px`;
  }

  return value;
}
