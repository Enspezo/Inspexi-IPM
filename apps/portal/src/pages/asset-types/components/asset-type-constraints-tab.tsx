// Constraints-tab: beheer de toegestane ouder-types (parent-constraints).
// Lokale werk-array; "Opslaan" stuurt de VOLLEDIGE set (PUT vervangt alles).

import { useEffect, useState } from 'react';
import { Button, Card, Select, Spinner, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { AssetTypeDefinition } from '@/types';
import {
  useAssetTypes,
  useAssetTypeConstraints,
  useSetAssetTypeConstraints,
  type ConstraintInput,
} from '../hooks/use-asset-types';

// Sentinel-waarde in de Select voor "geen ouder" (mag root zijn).
const ROOT_VALUE = '__root__';

interface WorkingConstraint {
  /** null = mag root zijn (geen ouder). */
  allowedParentTypeId: string | null;
  isRequired: boolean;
  /** Cache voor weergave van de naam. */
  name: string;
}

interface Props {
  assetTypeId: string;
  canManage: boolean;
}

export function AssetTypeConstraintsTab({ assetTypeId, canManage }: Props) {
  const { showToast } = useToast();
  const { data: constraints, isLoading } = useAssetTypeConstraints(assetTypeId);
  const { data: allTypes } = useAssetTypes();
  const setConstraints = useSetAssetTypeConstraints(assetTypeId);

  const [working, setWorking] = useState<WorkingConstraint[]>([]);
  const [pickValue, setPickValue] = useState<string>('');
  const [pickRequired, setPickRequired] = useState(false);

  // Seed de werk-array zodra de constraints geladen zijn.
  useEffect(() => {
    if (!constraints) return;
    setWorking(
      constraints.map((c) => ({
        allowedParentTypeId: c.allowedParentTypeId,
        isRequired: c.isRequired,
        name: c.allowedParentType?.name ?? (c.allowedParentTypeId == null ? 'Mag root zijn' : '(verwijderd)'),
      })),
    );
  }, [constraints]);

  const parentOptions = [
    { value: '', label: '— Kies ouder-type —' },
    { value: ROOT_VALUE, label: 'Mag root zijn (geen ouder)' },
    ...(allTypes ?? [])
      .filter((t: AssetTypeDefinition) => t.id !== assetTypeId)
      .map((t: AssetTypeDefinition) => ({ value: t.id, label: t.name })),
  ];

  const addConstraint = () => {
    if (!pickValue) return;
    const isRoot = pickValue === ROOT_VALUE;
    const parentId = isRoot ? null : pickValue;
    // Dubbel toevoegen voorkomen.
    if (working.some((w) => w.allowedParentTypeId === parentId)) {
      showToast('Dit ouder-type staat al in de lijst', 'info');
      return;
    }
    const name = isRoot
      ? 'Mag root zijn'
      : (allTypes ?? []).find((t) => t.id === parentId)?.name ?? '(onbekend)';
    setWorking((arr) => [...arr, { allowedParentTypeId: parentId, isRequired: pickRequired, name }]);
    setPickValue('');
    setPickRequired(false);
  };

  const removeConstraint = (idx: number) => {
    setWorking((arr) => arr.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const payload: ConstraintInput[] = working.map((w) => ({
      allowedParentTypeId: w.allowedParentTypeId,
      isRequired: w.isRequired,
    }));
    try {
      await setConstraints.mutateAsync(payload);
      showToast('Constraints opgeslagen', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
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
    <Card title="Toegestane ouder-types">
      <p className="mb-4 text-sm text-gray-600">
        Bepaal onder welke ouder-types dit asset-type geplaatst mag worden. Gebruik
        &ldquo;Mag root zijn&rdquo; om het asset-type op het hoogste niveau toe te staan.
        Markeer een ouder als &ldquo;verplicht&rdquo; wanneer dit asset-type alleen daaronder mag bestaan.
      </p>

      {/* Huidige set als chips */}
      {working.length === 0 ? (
        <p className="text-sm text-gray-500">
          Geen beperkingen ingesteld — dit asset-type mag overal geplaatst worden.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {working.map((w, idx) => (
            <span
              key={`${w.allowedParentTypeId ?? 'root'}-${idx}`}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-sm text-gray-700"
            >
              {w.name}
              {w.isRequired && (
                <span className="inline-flex items-center rounded-full bg-danger-50 px-1.5 py-0.5 text-xs font-medium text-danger-700">
                  verplicht
                </span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => removeConstraint(idx)}
                  className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  title="Verwijderen"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Toevoeg-controls */}
      {canManage && (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Select
                label="Ouder-type toevoegen"
                options={parentOptions}
                value={pickValue}
                onChange={(e) => setPickValue(e.target.value)}
              />
            </div>
            <label className="inline-flex items-center gap-2 pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={pickRequired}
                onChange={(e) => setPickRequired(e.target.checked)}
              />
              Verplicht
            </label>
            <Button type="button" variant="secondary" onClick={addConstraint} disabled={!pickValue}>
              Toevoegen
            </Button>
          </div>

          <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
            <Button onClick={handleSave} isLoading={setConstraints.isPending}>
              Opslaan
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
