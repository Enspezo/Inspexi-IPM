// Beheer van de scope-locaties van een inspectie: welke LOCATION-nodes uit de boom
// vallen binnen het plan. Toont de huidige selectie (met de primaire gemarkeerd) en
// laat je LOCATION-nodes toevoegen/verwijderen.
import { useMemo, useState } from 'react';
import { Button, Card, Select, Spinner, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { AssetNodeType } from '@/types';
import { useScopeLocations, usePlanTree } from '../hooks/use-asset-nodes';
import { normalizeTree, flattenTree, findNode, indentLabel } from '@/components/asset-tree';

export function ScopeLocationsManager({ planId, canWrite }: { planId: string; canWrite: boolean }) {
  const { showToast } = useToast();
  const { scopeLocations, isLoading, add, remove } = useScopeLocations(planId);
  const { data: treeData } = usePlanTree(planId);
  const [toAdd, setToAdd] = useState('');

  const tree = useMemo(() => normalizeTree(treeData), [treeData]);

  // Alleen LOCATION-nodes die nog niet in scope zitten zijn toe te voegen.
  const inScopeIds = new Set(scopeLocations.map((s) => s.assetNodeId));
  const addableOptions = flattenTree(tree)
    .filter((n) => n.nodeType === AssetNodeType.LOCATION && !inScopeIds.has(n.id))
    .map((n) => ({ value: n.id, label: indentLabel(n) }));

  const handleAdd = async () => {
    if (!toAdd) return;
    try {
      await add.mutateAsync(toAdd);
      setToAdd('');
      showToast('Scope-locatie toegevoegd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Toevoegen mislukt'), 'error');
    }
  };

  const handleRemove = async (assetNodeId: string) => {
    try {
      await remove.mutateAsync(assetNodeId);
      showToast('Scope-locatie verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  return (
    <Card title="Scope-locaties">
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : scopeLocations.length === 0 ? (
        <p className="py-2 text-sm text-gray-500">
          Nog geen scope-locaties. De hele objectboom valt dan binnen de inspectie.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {scopeLocations.map((s) => {
            const node = findNode(tree, s.assetNodeId);
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {node?.name ?? 'Onbekende locatie'}
                  </span>
                  {node?.identifier && (
                    <span className="truncate text-xs text-gray-400">{node.identifier}</span>
                  )}
                  {s.isPrimary && (
                    <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                      Primair
                    </span>
                  )}
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleRemove(s.assetNodeId)}
                    className="rounded p-1 text-gray-400 hover:bg-danger-50 hover:text-danger-600"
                    title="Uit scope verwijderen"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && addableOptions.length > 0 && (
        <div className="mt-4 flex items-end gap-2 border-t border-gray-100 pt-4">
          <div className="flex-1">
            <Select
              label="Locatie toevoegen aan scope"
              placeholder="— Kies een locatie —"
              options={addableOptions}
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={!toAdd} isLoading={add.isPending}>
            Toevoegen
          </Button>
        </div>
      )}
    </Card>
  );
}
