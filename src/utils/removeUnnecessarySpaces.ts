export function removeUnnecessarySpaces(string: string) {
  return string.replace(/(\s+)?([,;])(\s+)?/g, '$2');
}
