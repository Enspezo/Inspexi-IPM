import { useState } from 'react';
import { Button, Spinner, useConfirm, useToast } from '@/components/ui';
import { CustomFieldEntityType, CustomFieldType } from '@/types';
import type { CustomFieldDefinition } from '@/types';
import {
  useCustomFields,
  useDeleteCustomField,
} from '../hooks/use-custom-fields';
import { CustomFieldModal } from './custom-field-modal';

const ENTITY_TYPE_TABS: { key: CustomFieldEntityType; label: string }[] = [
  { key: CustomFieldEntityType.CONTACT, label: 'Relaties' },
  { key: CustomFieldEntityType.CONTACT_ADDRESS, label: 'Adressen' },
  { key: CustomFieldEntityType.LOCATION, label: 'Locaties' },
  { key: CustomFieldEntityType.REQUEST, label: 'Aanvragen' },
  { key: CustomFieldEntityType.QUOTE, label: 'Offertes' },
  { key: CustomFieldEntityType.PRODUCT, label: 'Producten' },
];

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  [CustomFieldType.TEXT]: 'Tekst',
  [CustomFieldType.NUMBER]: 'Getal',
  [CustomFieldType.DATE]: 'Datum',
  [CustomFieldType.BOOLEAN]: 'Ja/Nee',
  [CustomFieldType.SELECT]: 'Keuzelijst',
};

const MAX_PER_ENTITY = 5;
const MAX_TOTAL = 10;

export function CustomFieldsManagement() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: allFields, isLoading } = useCustomFields();
  const deleteMutation = useDeleteCustomField();

  const [selectedEntityType, setSelectedEntityType] = useState<CustomFieldEntityType>(
    CustomFieldEntityType.CONTACT,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | undefined>(undefined);

  const activeFields = (allFields ?? []).filter((f) => !f.isDeleted);
  const fieldsForEntity = activeFields.filter(
    (f) => f.entityType === selectedEntityType,
  );
  const totalCount = activeFields.length;
  const entityCount = fieldsForEntity.length;

  const handleCreate = () => {
    setEditingField(undefined);
    setModalOpen(true);
  };

  const handleEdit = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setModalOpen(true);
  };

  const handleDelete = async (field: CustomFieldDefinition) => {
    const confirmed = await confirm({
      title: 'Eigen veld verwijderen',
      message: `Weet u zeker dat u het veld "${field.label}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync(field.id);
      showToast('Eigen veld verwijderd', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
        'error',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Eigen velden</h3>
        <p className="mt-1 text-sm text-gray-500">
          Definieer eigen velden per entiteit. Deze velden worden zichtbaar op
          de detail- en bewerkpagina's.
        </p>
      </div>

      {/* Entity type tabs */}
      <div className="flex flex-wrap gap-2">
        {ENTITY_TYPE_TABS.map((tab) => {
          const isActive = selectedEntityType === tab.key;
          const count = activeFields.filter((f) => f.entityType === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedEntityType(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium ${
                    isActive
                      ? 'bg-primary-200 text-primary-800'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Usage counters */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>
          {entityCount} van {MAX_PER_ENTITY} voor dit type
        </span>
        <span className="text-gray-300">|</span>
        <span>
          {totalCount} van {MAX_TOTAL} totaal
        </span>
      </div>

      {/* Field list */}
      {fieldsForEntity.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">
            Geen eigen velden voor{' '}
            {ENTITY_TYPE_TABS.find((t) => t.key === selectedEntityType)?.label?.toLowerCase()}.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {fieldsForEntity
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    {field.label}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-600/20">
                    {FIELD_TYPE_LABELS[field.fieldType]}
                  </span>
                  {field.isRequired && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                      Verplicht
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(field)}
                  >
                    Bewerken
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(field)}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    isLoading={deleteMutation.isPending}
                  >
                    Verwijderen
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Add button */}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleCreate}
          disabled={entityCount >= MAX_PER_ENTITY || totalCount >= MAX_TOTAL}
        >
          + Toevoegen
        </Button>
        {(entityCount >= MAX_PER_ENTITY || totalCount >= MAX_TOTAL) && (
          <p className="mt-2 text-sm text-amber-600">
            {entityCount >= MAX_PER_ENTITY
              ? `Maximum van ${MAX_PER_ENTITY} velden voor dit type bereikt.`
              : `Maximum van ${MAX_TOTAL} eigen velden totaal bereikt.`}
          </p>
        )}
      </div>

      {/* Create/Edit modal */}
      <CustomFieldModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingField(undefined);
        }}
        existingField={editingField}
        entityType={selectedEntityType}
      />
    </div>
  );
}
