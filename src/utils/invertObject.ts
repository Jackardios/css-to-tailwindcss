export function invertObject<K extends string | number | symbol>(
  object: Record<K, any>
) {
  const result: Record<string, K> = {} as any;

  Object.keys(object).forEach(key => {
    let value = object[key as K];

    if (typeof value.toString !== 'function') {
      value = toString.call(value);
    } else {
      value = value.toString();
    }

    result[value] = key as K;
  });

  return result;
}
