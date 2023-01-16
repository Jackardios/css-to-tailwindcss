import { parseCSSFunction } from './parseCSSFunction';

export function everyCSSFunction(
  value: string,
  callbackFn: (
    parsedCSSFunction: ReturnType<typeof parseCSSFunction>
  ) => boolean | void
) {
  value
    .trim()
    .split(/\s+/)
    .every(functionString => {
      return callbackFn(parseCSSFunction(functionString));
    });
}
