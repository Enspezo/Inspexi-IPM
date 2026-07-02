// Pure helpers voor de AssetNode-boom: afvlakken, pad/breadcrumb bepalen,
// nakomelingen detecteren en geldige verplaats-doelen filteren. Geen React.
import type { AssetNode } from '@/types';

/** Een node met gegarandeerd `children` (lege array i.p.v. undefined). */
export interface TreeNode extends AssetNode {
  children: TreeNode[];
}

/** Normaliseer een (deels) geprojecteerde boom: zorg dat elke node `children` heeft. */
export function normalizeTree(nodes: AssetNode[] | undefined): TreeNode[] {
  if (!nodes) return [];
  return nodes.map((n) => ({
    ...n,
    children: normalizeTree(n.children),
  }));
}

/** Vlakke lijst van alle nodes (depth-first, ouders vóór kinderen). */
export function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Zoek één node op id in de boom. */
export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inChild = findNode(n.children, id);
    if (inChild) return inChild;
  }
  return null;
}

/**
 * Pad van de root tot en met de node met `id` (breadcrumb). Lege array als de
 * node niet gevonden wordt.
 */
export function pathToNode(nodes: TreeNode[], id: string): TreeNode[] {
  for (const n of nodes) {
    if (n.id === id) return [n];
    const sub = pathToNode(n.children, id);
    if (sub.length) return [n, ...sub];
  }
  return [];
}

/** Alle nakomeling-id's van een node (exclusief de node zelf). */
export function descendantIds(node: TreeNode): Set<string> {
  const ids = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const c of list) {
      ids.add(c.id);
      walk(c.children);
    }
  };
  walk(node.children);
  return ids;
}

/**
 * Geldige nieuwe ouders voor een te verplaatsen node: niet de node zelf en geen
 * van zijn nakomelingen (dat zou een cykel maken). LOCATION-nodes mogen alleen
 * onder LOCATION/ASSET-nodes; ASSET-nodes mogen onder LOCATION/ASSET — beide
 * sluiten ASSET→(root) niet uit want de root is altijd een LOCATION.
 */
export function validMoveTargets(allNodes: TreeNode[], moving: TreeNode): TreeNode[] {
  const blocked = descendantIds(moving);
  blocked.add(moving.id);
  return flattenTree(allNodes).filter((n) => !blocked.has(n.id));
}

/** Tel de nodes van een bepaald type in de boom. */
export function countByType(nodes: TreeNode[], nodeType: AssetNode['nodeType']): number {
  return flattenTree(nodes).filter((n) => n.nodeType === nodeType).length;
}

/** Inspringlabel voor een afgevlakte selector-optie ("— — Naam"). */
export function indentLabel(node: TreeNode): string {
  const prefix = '— '.repeat(Math.max(0, node.depth));
  const id = node.identifier ? ` (${node.identifier})` : '';
  return `${prefix}${node.name}${id}`;
}
