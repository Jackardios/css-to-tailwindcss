declare module 'postcss-js' {
  import type { Root } from 'postcss';

  export function objectify(root: Root): Record<string, any>;
}
