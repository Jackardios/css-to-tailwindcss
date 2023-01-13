import type { Node, Root } from 'postcss';

export function isRootNode(node: Node | undefined): node is Root {
  return !!(node?.type === 'root');
}
