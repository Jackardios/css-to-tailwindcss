import type { RemoveIndex } from './RemoveKeys';

export type KnownKeys<T> = keyof RemoveIndex<T>;
