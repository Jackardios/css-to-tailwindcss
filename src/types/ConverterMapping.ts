import type { ThemeConfig } from 'tailwindcss/types/config';
import type { KnownKeys } from './utils/KnownKeys';

export type ConverterMapping = Record<
  | Exclude<KnownKeys<ThemeConfig>, 'keyframes' | 'container' | 'fontFamily'>
  | 'aria'
  | 'data',
  Record<string, string>
>;
