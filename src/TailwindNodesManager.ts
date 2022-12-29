import type { Declaration } from 'postcss';
import type { SetPartialProps } from './types/utils/SetPartialProps';

export interface TailwindNode {
  selector: string;
  tailwindClasses: string[];
  skippedDeclarations: Declaration[];
}

export type MergeableNode =
  | SetPartialProps<TailwindNode, 'tailwindClasses'>
  | SetPartialProps<TailwindNode, 'skippedDeclarations'>;

export class TailwindNodesManager {
  protected nodes: TailwindNode[];
  protected nodesMap: Record<TailwindNode['selector'], number> = {};

  constructor(initialNodes: TailwindNode[] = []) {
    this.nodes = initialNodes;
    this.refreshNodesMap();
  }

  getNodeIndexBySelector(selector: string) {
    return this.nodesMap[selector];
  }

  getNodeBySelector(selector: string) {
    return this.nodes[this.getNodeIndexBySelector(selector)];
  }

  getNodes() {
    return this.nodes;
  }

  mergeNode(mergeableNode: MergeableNode) {
    let node = this.getNodeBySelector(mergeableNode.selector);

    if (node) {
      if (mergeableNode.tailwindClasses) {
        node.tailwindClasses = [
          ...new Set([
            ...node.tailwindClasses,
            ...mergeableNode.tailwindClasses,
          ]),
        ];
      }
      if (mergeableNode.skippedDeclarations) {
        node.skippedDeclarations = [
          ...node.skippedDeclarations,
          ...mergeableNode.skippedDeclarations,
        ];
      }
    } else {
      node = {
        selector: mergeableNode.selector,
        tailwindClasses: mergeableNode.tailwindClasses || [],
        skippedDeclarations: mergeableNode.skippedDeclarations || [],
      };
      this.addNode(node);
    }

    return node;
  }

  mergeNodes(nodes: MergeableNode[]) {
    nodes.forEach(node => this.mergeNode(node));

    return this;
  }

  mergeNodesManager(nodesManager: TailwindNodesManager) {
    return this.mergeNodes(nodesManager.getNodes());
  }

  protected addNode(node: TailwindNode) {
    this.nodesMap[node.selector] = this.nodes.push(node) - 1;

    return this;
  }

  protected refreshNodesMap() {
    this.nodesMap = this.nodes.reduce((nodesMap, node, index) => {
      nodesMap[node.selector] = index;
      return nodesMap;
    }, {} as Record<TailwindNode['selector'], number>);

    return this;
  }
}
