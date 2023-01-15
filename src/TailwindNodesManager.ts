import type { AtRule, Rule } from 'postcss';
import { isAtRuleNode } from './utils/isAtRuleNode';
import { isChildNode } from './utils/isChildNode';

export interface ResolvedTailwindNode {
  rule: Rule;
  tailwindClasses: string[];
}

export interface UnresolvedTailwindNode {
  key: string;
  fallbackRule: Rule;
  classesPrefixWhenFound: string;
  tailwindClasses: string[];
}

export type TailwindNode = ResolvedTailwindNode | UnresolvedTailwindNode;

export function isResolvedTailwindNode(
  node: TailwindNode
): node is ResolvedTailwindNode {
  return 'rule' in node;
}

export function isUnresolvedTailwindNode(
  node: TailwindNode
): node is UnresolvedTailwindNode {
  return !isResolvedTailwindNode(node);
}

export class TailwindNodesManager {
  protected nodesMap: Map<string, ResolvedTailwindNode>;

  constructor(initialNodes?: TailwindNode[]) {
    this.nodesMap = new Map();
    if (initialNodes?.length) {
      this.mergeNodes(initialNodes);
    }
  }

  mergeNode(node: TailwindNode) {
    const nodeIsResolved = isResolvedTailwindNode(node);
    const key = nodeIsResolved
      ? TailwindNodesManager.convertRuleToKey(node.rule)
      : node.key;
    const foundNode = this.nodesMap.get(key);

    if (!foundNode) {
      if (nodeIsResolved) {
        this.nodesMap.set(key, node);
      } else {
        this.nodesMap.set(
          TailwindNodesManager.convertRuleToKey(node.fallbackRule),
          {
            rule: node.fallbackRule,
            tailwindClasses: node.tailwindClasses,
          }
        );
      }
      return;
    }

    foundNode.tailwindClasses = foundNode.tailwindClasses.concat(
      nodeIsResolved
        ? node.tailwindClasses
        : node.tailwindClasses.map(
            className => `${node.classesPrefixWhenFound}${className}`
          )
    );
  }

  mergeNodes(nodes: TailwindNode[]) {
    nodes.forEach(node => {
      this.mergeNode(node);
    });
  }

  hasNode(key: string) {
    return this.nodesMap.has(key);
  }

  getNode(key: string) {
    return this.nodesMap.get(key) || null;
  }

  getNodes() {
    return Array.from(this.nodesMap.values());
  }

  static convertRuleToKey(rule: Rule) {
    let currentParent = rule.parent;
    let parentKey = '';

    while (isChildNode(currentParent)) {
      parentKey +=
        (isAtRuleNode(currentParent)
          ? this.makeSingleAtRuleKey(currentParent)
          : this.makeSingleRuleKey(currentParent)) + '__';

      currentParent = currentParent.parent;
    }

    return parentKey + rule.selector;
  }

  protected static makeSingleAtRuleKey(atRule: AtRule) {
    return 'a(' + atRule.name + '|' + atRule.params + ')';
  }

  protected static makeSingleRuleKey(atRule: Rule) {
    return 'r(' + atRule.selector + ')';
  }
}
