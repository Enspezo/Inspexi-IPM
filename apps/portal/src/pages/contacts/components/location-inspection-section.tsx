// Inspectie-gedeelte van de CRM-locatiedetailpagina:
//  1. Uitgebreide inspectievelden — de `technicalData` van de wortel-inspectienode,
//     gedreven door de INSPECTION-scoped LocationTypeDefinition die matcht op typeCode.
//  2. De inspectie-objectboom (AssetNode-tree) van deze locatie, volledig beheerbaar.
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Spinner, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import {
  TreeExplorer,
  TechnicalDataForm,
  normalizeTree,
  type TechnicalField,
} from '@/components/asset-tree';
import { TechnicalDataList } from '@/pages/assets/components/technical-data-list';
import { useLocationTypes, useLocationTypeFields } from '@/pages/location-types/hooks/use-location-types';
import { useAssetTree, useUpdateAssetNode } from '@/pages/inspections/hooks/use-asset-nodes';

export function LocationInspectionSection({
  locationId,
  canWrite,
}: {
  locationId: string;
  canWrite: boolean;
}) {
  const { data: treeData, isLoading } = useAssetTree(locationId);
  const root = useMemo(() => normalizeTree(treeData)[0] ?? null, [treeData]);

  return (
    <div className="space-y-6">
      <ExtendedInspectionFields root={root} canWrite={canWrite} />

      <Card title="Inspectie-objectboom">
        <TreeExplorer nodes={treeData} isLoading={isLoading} canWrite={canWrite} />
      </Card>
    </div>
  );
}

interface RootNode {
  id: string;
  typeCode: string;
  technicalData: Record<string, unknown>;
}

function ExtendedInspectionFields({
  root,
  canWrite,
}: {
  root: RootNode | null;
  canWrite: boolean;
}) {
  const { showToast } = useToast();
  const updateMutation = useUpdateAssetNode();

  // INSPECTION-scoped type dat matcht op de typeCode van de wortelnode.
  const { data: inspectionTypes = [] } = useLocationTypes({ scope: 'INSPECTION' });
  const typeDef = root ? inspectionTypes.find((t) => t.code === root.typeCode) ?? null : null;
  const { data: fieldDefs = [] } = useLocationTypeFields(typeDef?.id ?? '');
  const fields = fieldDefs as TechnicalField[];

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (root) setDraft((root.technicalData as Record<string, unknown>) ?? {});
  }, [root]);

  if (!root) {
    return (
      <Card title="Uitgebreide inspectiegegevens">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ id: root.id, data: { technicalData: draft } });
      showToast('Inspectiegegevens bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Card
      title="Uitgebreide inspectiegegevens"
      actions={
        canWrite && fields.length > 0 && !isEditing ? (
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            Bewerken
          </Button>
        ) : undefined
      }
    >
      {fields.length === 0 ? (
        <p className="text-sm text-gray-400">
          Voor dit locatietype zijn geen uitgebreide inspectievelden gedefinieerd.
        </p>
      ) : isEditing ? (
        <div className="space-y-4">
          <TechnicalDataForm fields={fields} value={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDraft((root.technicalData as Record<string, unknown>) ?? {});
                setIsEditing(false);
              }}
            >
              Annuleren
            </Button>
            <Button onClick={handleSave} isLoading={updateMutation.isPending}>
              Opslaan
            </Button>
          </div>
        </div>
      ) : (
        <TechnicalDataList data={root.technicalData} />
      )}
    </Card>
  );
}
