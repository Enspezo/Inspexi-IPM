import { describe, it, expect } from 'vitest';
import {
  normalizeTree,
  flattenTree,
  findNode,
  pathToNode,
  descendantIds,
  validMoveTargets,
  countByType,
  indentLabel,
} from './tree-utils';
import { AssetNodeType, type AssetNode } from '@/types';

// Minimale node-fabriek; alleen de velden die de helpers raken.
function node(partial: Partial<AssetNode> & { id: string }): AssetNode {
  return {
    orgId: 'org',
    nodeType: AssetNodeType.LOCATION,
    parentId: null,
    rootLocationId: null,
    typeCode: 'building',
    name: partial.id,
    identifier: null,
    description: null,
    technicalData: {},
    statusCode: 'new',
    notes: null,
    sortOrder: 0,
    path: null,
    depth: 0,
    createdAt: '',
    updatedAt: '',
    syncedAt: null,
    createdBy: null,
    deviceId: null,
    deletedAt: null,
    ...partial,
  };
}

// root (LOCATION, depth 0)
//  ├─ floor1 (LOCATION, depth 1)
//  │   └─ assetA (ASSET, depth 2)
//  └─ floor2 (LOCATION, depth 1)
const sample: AssetNode[] = [
  node({
    id: 'root',
    depth: 0,
    children: [
      node({
        id: 'floor1',
        depth: 1,
        children: [node({ id: 'assetA', nodeType: AssetNodeType.ASSET, depth: 2, identifier: 'A-1' })],
      }),
      node({ id: 'floor2', depth: 1 }),
    ],
  }),
];

describe('tree-utils', () => {
  it('normalizeTree guarantees a children array at every level', () => {
    const tree = normalizeTree([node({ id: 'x' })]);
    expect(tree[0].children).toEqual([]);
  });

  it('flattenTree walks depth-first, parents before children', () => {
    const ids = flattenTree(normalizeTree(sample)).map((n) => n.id);
    expect(ids).toEqual(['root', 'floor1', 'assetA', 'floor2']);
  });

  it('findNode locates a deep node', () => {
    expect(findNode(normalizeTree(sample), 'assetA')?.id).toBe('assetA');
    expect(findNode(normalizeTree(sample), 'nope')).toBeNull();
  });

  it('pathToNode returns the breadcrumb root→node', () => {
    const path = pathToNode(normalizeTree(sample), 'assetA').map((n) => n.id);
    expect(path).toEqual(['root', 'floor1', 'assetA']);
  });

  it('descendantIds excludes the node itself', () => {
    const root = findNode(normalizeTree(sample), 'root')!;
    expect([...descendantIds(root)].sort()).toEqual(['assetA', 'floor1', 'floor2']);
  });

  it('validMoveTargets excludes the node and its descendants', () => {
    const tree = normalizeTree(sample);
    const floor1 = findNode(tree, 'floor1')!;
    const ids = validMoveTargets(tree, floor1).map((n) => n.id);
    expect(ids).toEqual(['root', 'floor2']); // not floor1, not assetA
  });

  it('countByType counts only the requested nodeType', () => {
    const tree = normalizeTree(sample);
    expect(countByType(tree, AssetNodeType.ASSET)).toBe(1);
    expect(countByType(tree, AssetNodeType.LOCATION)).toBe(3);
  });

  it('indentLabel indents by depth and appends the identifier', () => {
    const assetA = findNode(normalizeTree(sample), 'assetA')!;
    expect(indentLabel(assetA)).toBe('— — assetA (A-1)');
  });
});
