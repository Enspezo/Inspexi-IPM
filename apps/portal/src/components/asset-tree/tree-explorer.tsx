// Herbruikbare boom-verkenner voor de geünificeerde AssetNode-boom: in-/uitklappen,
// breadcrumb van de geselecteerde node, iconen per type, en (optioneel) acties om
// nodes aan te maken, te verplaatsen en te soft-deleten — telkens met ouder-selector.
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Spinner, useConfirm, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { AssetNodeType, type AssetNode } from '@/types';
import { useDeleteAssetNode } from '@/pages/inspections/hooks/use-asset-nodes';
import { NodeIcon } from './node-icon';
import { AssetNodeFormModal } from './asset-node-form-modal';
import { MoveNodeModal } from './move-node-modal';
import { normalizeTree, pathToNode, type TreeNode } from './tree-utils';

interface TreeExplorerProps {
  nodes: AssetNode[] | undefined;
  isLoading?: boolean;
  canWrite?: boolean;
  /** Plancontext: nieuwe nodes via het plan-endpoint (server kiest default-parent). */
  planId?: string;
  /** Voorgevulde ouder voor "Nieuw" wanneer er niets geselecteerd is. */
  defaultParentId?: string | null;
  /** Voorgevuld nodeType in de aanmaak-modal. */
  defaultNodeType?: AssetNodeType;
  /** Markeer LOCATION-nodes met `inScope` (planboom). */
  highlightInScope?: boolean;
  /** Gecontroleerde selectie (optioneel). */
  selectedId?: string | null;
  onSelect?: (node: TreeNode | null) => void;
  emptyMessage?: string;
  /** Extra badges rechts in de rij. */
  renderNodeBadges?: (node: TreeNode) => ReactNode;
}

export function TreeExplorer({
  nodes,
  isLoading,
  canWrite = false,
  planId,
  defaultParentId,
  defaultNodeType = AssetNodeType.ASSET,
  highlightInScope = false,
  selectedId: controlledSelectedId,
  onSelect,
  emptyMessage = 'Nog geen nodes in deze boom.',
  renderNodeBadges,
}: TreeExplorerProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const deleteMutation = useDeleteAssetNode();

  const tree = useMemo(() => normalizeTree(nodes), [nodes]);
  const rootId = tree[0]?.id ?? null;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelected;

  // Modal-state.
  const [createCtx, setCreateCtx] = useState<{ parentId: string | null } | null>(null);
  const [editNode, setEditNode] = useState<AssetNode | null>(null);
  const [moveNode, setMoveNode] = useState<TreeNode | null>(null);

  const breadcrumb = selectedId ? pathToNode(tree, selectedId) : [];

  const select = (node: TreeNode | null) => {
    if (controlledSelectedId === undefined) setInternalSelected(node?.id ?? null);
    onSelect?.(node);
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (node: TreeNode) => {
    const confirmed = await confirm({
      title: 'Node verwijderen',
      message: `"${node.name}" en alle onderliggende nodes worden verwijderd. Doorgaan?`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      const res = await deleteMutation.mutateAsync(node.id);
      if (selectedId === node.id) select(null);
      showToast(
        res.affected > 1 ? `${res.affected} nodes verwijderd` : 'Node verwijderd',
        'success',
      );
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar + breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500" aria-label="Pad">
          {breadcrumb.length === 0 ? (
            <span className="text-gray-400">Selecteer een node…</span>
          ) : (
            breadcrumb.map((n, i) => (
              <span key={n.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">/</span>}
                <button
                  type="button"
                  onClick={() => select(n)}
                  className={`hover:text-gray-700 ${
                    i === breadcrumb.length - 1 ? 'font-medium text-gray-900' : ''
                  }`}
                >
                  {n.name}
                </button>
              </span>
            ))
          )}
        </nav>
        {canWrite && tree.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreateCtx({ parentId: selectedId ?? defaultParentId ?? rootId })}
          >
            + Node toevoegen
          </Button>
        )}
      </div>

      {/* Boom */}
      {tree.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{emptyMessage}</p>
      ) : (
        <ul className="rounded-lg border border-gray-100">
          {tree.map((n) => (
            <TreeRow
              key={n.id}
              node={n}
              depth={0}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              selectedId={selectedId}
              onSelect={select}
              canWrite={canWrite}
              highlightInScope={highlightInScope}
              renderNodeBadges={renderNodeBadges}
              onAddChild={(parentId) => setCreateCtx({ parentId })}
              onEdit={setEditNode}
              onMove={setMoveNode}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {/* Modals */}
      {createCtx && (
        <AssetNodeFormModal
          isOpen
          onClose={() => setCreateCtx(null)}
          nodes={tree}
          planId={planId}
          defaultParentId={createCtx.parentId}
          defaultNodeType={defaultNodeType}
        />
      )}
      {editNode && (
        <AssetNodeFormModal
          isOpen
          onClose={() => setEditNode(null)}
          nodes={tree}
          planId={planId}
          node={editNode}
        />
      )}
      <MoveNodeModal
        isOpen={!!moveNode}
        onClose={() => setMoveNode(null)}
        node={moveNode}
        nodes={tree}
      />
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null | undefined;
  onSelect: (node: TreeNode) => void;
  canWrite: boolean;
  highlightInScope: boolean;
  renderNodeBadges?: (node: TreeNode) => ReactNode;
  onAddChild: (parentId: string) => void;
  onEdit: (node: TreeNode) => void;
  onMove: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
  canWrite,
  highlightInScope,
  renderNodeBadges,
  onAddChild,
  onEdit,
  onMove,
  onDelete,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isSelected = selectedId === node.id;
  // De wortel (geen parent) vertegenwoordigt de CRM-locatie zelf: niet verplaatsbaar
  // of verwijderbaar via de boom.
  const isRoot = node.parentId === null;
  const showScope =
    highlightInScope && node.nodeType === AssetNodeType.LOCATION && node.inScope === true;

  return (
    <>
      <li className="border-b border-gray-100 last:border-b-0">
        <div
          className={`group flex items-center gap-1.5 px-2 py-2 ${
            isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
          } ${showScope ? 'border-l-2 border-l-primary-400' : 'border-l-2 border-l-transparent'}`}
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
        >
          {/* Chevron / spacer */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              aria-label={isCollapsed ? 'Uitklappen' : 'Inklappen'}
              aria-expanded={!isCollapsed}
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}

          <NodeIcon nodeType={node.nodeType} typeCode={node.typeCode} />

          {/* Naam + kenmerk (selecteert de node) */}
          <button
            type="button"
            onClick={() => onSelect(node)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className={`truncate text-sm ${isSelected ? 'font-semibold' : 'font-medium'} text-gray-900`}>
              {node.name}
            </span>
            {node.nodeNumber && (
              <span className="shrink-0 font-mono text-[11px] text-gray-400">{node.nodeNumber}</span>
            )}
            {node.identifier && <span className="truncate text-xs text-gray-400">{node.identifier}</span>}
          </button>

          {/* Badges */}
          <div className="flex shrink-0 items-center gap-1.5">
            {showScope && (
              <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                In scope
              </span>
            )}
            {renderNodeBadges?.(node)}
            {(node.findingCount ?? 0) > 0 && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800">
                {node.findingCount}
              </span>
            )}
          </div>

          {/* Acties */}
          {canWrite && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <IconButton title="Onderliggende toevoegen" onClick={() => onAddChild(node.id)} d="M12 4v16m8-8H4" />
              <IconButton
                title="Bewerken"
                onClick={() => onEdit(node)}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
              {!isRoot && (
                <IconButton
                  title="Verplaatsen"
                  onClick={() => onMove(node)}
                  d="M4 8l4-4m0 0l4 4M8 4v16m12-4l-4 4m0 0l-4-4m4 4V4"
                />
              )}
              {!isRoot && (
                <IconButton title="Verwijderen" onClick={() => onDelete(node)} d="M6 18L18 6M6 6l12 12" danger />
              )}
            </div>
          )}
        </div>
      </li>

      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
            selectedId={selectedId}
            onSelect={onSelect}
            canWrite={canWrite}
            highlightInScope={highlightInScope}
            renderNodeBadges={renderNodeBadges}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

function IconButton({
  title,
  onClick,
  d,
  danger,
}: {
  title: string;
  onClick: () => void;
  d: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-1 text-gray-400 hover:bg-gray-100 ${
        danger ? 'hover:text-danger-600' : 'hover:text-gray-700'
      }`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </button>
  );
}
