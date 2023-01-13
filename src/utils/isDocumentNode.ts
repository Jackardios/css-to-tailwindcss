import type { Node, Document } from 'postcss';

export function isDocumentNode(node: Node | undefined): node is Document {
  return !!(node?.type === 'document');
}
