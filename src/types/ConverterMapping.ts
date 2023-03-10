import type { ThemeConfig } from 'tailwindcss/types/config';
import type { KnownKeys } from './utils/KnownKeys';

export type ConverterMapping = Record<
  Exclude<KnownKeys<ThemeConfig>, 'keyframes' | 'container' | 'fontFamily'>,
  Record<string, string>
> &
  Record<'aria' | 'data' | 'supports', Record<string, string> | undefined>;
