/**
 * Returns the own property of the object: CSS may contain names like `constructor` or `toString`.
 */
export function getOwn<T>(
  object: Record<string, T> | null | undefined,
  key: string
): T | undefined {
  return object && Object.prototype.hasOwnProperty.call(object, key)
    ? object[key]
    : undefined;
}
