import type {
  AttributeSelector,
  PseudoElement,
  PseudoSelector,
  TagSelector,
} from 'css-what';
import type { Declaration } from 'postcss';

import { parse, stringify } from 'css-what';
import { isAriaSelector } from './utils/isAriaSelector';

export interface TailwindNode {
  selector: string;
  tailwindClasses: string[];
  skippedDeclarations: Declaration[];
}

export type MergeableNode = Pick<TailwindNode, 'selector'> &
  Partial<Omit<TailwindNode, 'selector'>>;

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
    mergeableNode = this.normalizeNode(mergeableNode);

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

  protected addNode(node: TailwindNode) {
    this.nodesMap[node.selector] = this.nodes.push(node) - 1;

    return this;
  }

  protected normalizeNode<T extends MergeableNode | TailwindNode>(node: T): T {
    const parsedSelector = this.parseSelector(node.selector);

    node.selector = parsedSelector.selector;
    node.tailwindClasses = node.tailwindClasses?.map(className => {
      return `${parsedSelector.classesPrefix}${className}`;
    });

    return node;
  }

  protected parseSelector(selector: string) {
    const parsedSelector = parse(selector)[0];
    const base: Array<TagSelector | AttributeSelector> = [];
    const convertable: Array<
      AttributeSelector | PseudoSelector | PseudoElement
    > = [];

    parsedSelector?.forEach(item => {
      if (
        ['pseudo', 'pseudo-element'].includes(item.type) ||
        isAriaSelector(item)
      ) {
        convertable.push(
          item as AttributeSelector | PseudoSelector | PseudoElement
        );
      } else if (['tag', 'attribute'].includes(item.type)) {
        base.push(item as TagSelector | AttributeSelector);
      }
    });

    const isComplexSelector =
      base.length + convertable.length !== parsedSelector.length;

    if (isComplexSelector) {
      return {
        selector,
        classesPrefix: '',
      };
    }

    return {
      selector: stringify([base]),
      classesPrefix: convertable.map(item => `${item.name}:`).join(''),
    };
  }

  protected refreshNodesMap() {
    this.nodesMap = this.nodes.reduce((nodesMap, node, index) => {
      nodesMap[node.selector] = index;
      return nodesMap;
    }, {} as Record<TailwindNode['selector'], number>);

    return this;
  }
}
