// Velden-tab: sleepbare lijst van asset-type-velden + toevoegen/bewerken/verwijderen.

import { useState } from 'react';
import { Button, Card, Spinner, SortableList, DragHandle, useConfirm, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { AssetFieldType, type AssetTypeField } from '@/types';
import {
  useAssetTypeFields,
  useReorderAssetTypeFields,
  useDeleteAssetTypeField,
} from '../hooks/use-asset-types';
import { AssetTypeFieldModal } from './asset-type-field-modal';

const FIELD_TYPE_LABELS: Record<AssetFieldType, string> = {
  [AssetFieldType.text]: 'Tekst',
  [AssetFieldType.number]: 'Getal',
  [AssetFieldType.select]: 'Keuze',
  [AssetFieldType.checkbox]: 'Checkbox',
  [AssetFieldType.date]: 'Datum',
  [AssetFieldType.textarea]: 'Tekstvak',
};

interface Props {
  assetTypeId: string;
  canManage: boolean;
}

export function AssetTypeFieldsTab({ assetTypeId, canManage }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: fields, isLoading } = useAssetTypeFields(assetTypeId);
  const reorder = useReorderAssetTypeFields(assetTypeId);
  const deleteField = useDeleteAssetTypeField(assetTypeId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssetTypeField | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (field: AssetTypeField) => {
    setEditing(field);
    setModalOpen(true);
  };

  const handleDelete = async (field: AssetTypeField) => {
    const confirmed = await confirm({
      title: 'Veld verwijderen',
      message: `Weet je zeker dat je het veld "${field.label}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteField.mutateAsync(field.id);
      showToast('Veld verwijderd', 'success');
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

  const items = fields ?? [];

  return (
    <Card
      title={`Velden (${items.length})`}
      actions={canManage ? <Button onClick={openCreate}>Veld toevoegen</Button> : undefined}
    >
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Nog geen velden. {canManage && 'Klik op "Veld toevoegen" om te beginnen.'}
        </p>
      ) : (
        <SortableList
          items={items}
          getId={(f) => f.id}
          disabled={!canManage}
          onReorder={(ids) => reorder.mutate(ids)}
          className="space-y-2"
          renderItem={(field, { dragHandleProps }) => (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              {canManage && <DragHandle {...dragHandleProps} />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{field.label}</span>
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {field.fieldKey}
                  </code>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {FIELD_TYPE_LABELS[field.fieldType]}
                  </span>
                  {field.isRequired && (
                    <span className="inline-flex items-center rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-700">
                      Verplicht
                    </span>
                  )}
                  {field.unit && <span className="text-xs text-gray-400">{field.unit}</span>}
                </div>
                {field.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">{field.description}</p>
                )}
              </div>
              {canManage && (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(field)}>
                    Bewerken
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(field)}>
                    Verwijderen
                  </Button>
                </div>
              )}
            </div>
          )}
        />
      )}

      <AssetTypeFieldModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        assetTypeId={assetTypeId}
        field={editing}
      />
    </Card>
  );
}
