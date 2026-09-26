const PUNCTUATION_REGEXP = /[,;:]/;

export function removeUnnecessarySpaces(string: string) {
  // whitespace runs are matched as a whole, a pattern like `\s*[,;:]\s*` backtracks quadratically on them
  return string.replace(/[ \t\n\r\f]+/g, (spaces: string, offset: number) =>
    PUNCTUATION_REGEXP.test(string.charAt(offset - 1)) ||
    PUNCTUATION_REGEXP.test(string.charAt(offset + spaces.length))
      ? ''
      : spaces
  );
}
