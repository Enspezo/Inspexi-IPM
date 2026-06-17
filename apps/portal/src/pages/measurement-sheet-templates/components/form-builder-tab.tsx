// Form-builder tab: sleepbare secties (SortableList) met per sectie een geneste
// sleepbare veldenlijst. Secties + velden toevoegen/bewerken/verwijderen via modals.
// Alleen schrijfbaar wanneer canEdit (SUPERUSER + CONCEPT).

import { useState } from 'react';
import { Button, Card, SortableList, DragHandle, useConfirm, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import {
  MeasurementSheetFieldType,
  type MeasurementSheetSection,
  type MeasurementSheetField,
} from '@/types';
import {
  useReorderSections,
  useDeleteSection,
  useReorderFields,
  useDeleteField,
} from '../hooks/use-measurement-sheet-templates';
import { SectionModal } from './section-modal';
import { FieldModal } from './field-modal';

const FIELD_TYPE_LABELS: Record<MeasurementSheetFieldType, string> = {
  [MeasurementSheetFieldType.NUMBER]: 'Getal',
  [MeasurementSheetFieldType.TEXT]: 'Tekst',
  [MeasurementSheetFieldType.TEXTAREA]: 'Tekstvak',
  [MeasurementSheetFieldType.CHECKBOX]: 'Checkbox',
  [MeasurementSheetFieldType.DROPDOWN]: 'Keuzelijst',
  [MeasurementSheetFieldType.CALCULATED]: 'Berekend',
  [MeasurementSheetFieldType.PHOTO]: 'Foto',
};

interface Props {
  templateId: string;
  sections: MeasurementSheetSection[];
  canEdit: boolean;
}

export function FormBuilderTab({ templateId, sections, canEdit }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const reorderSections = useReorderSections(templateId);
  const deleteSection = useDeleteSection(templateId);

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<MeasurementSheetSection | null>(null);

  // Veld-modal context: voor welke sectie + welk veld (of nieuw).
  const [fieldCtx, setFieldCtx] = useState<{
    section: MeasurementSheetSection;
    field: MeasurementSheetField | null;
  } | null>(null);

  const openCreateSection = () => {
    setEditingSection(null);
    setSectionModalOpen(true);
  };
  const openEditSection = (section: MeasurementSheetSection) => {
    setEditingSection(section);
    setSectionModalOpen(true);
  };

  const handleDeleteSection = async (section: MeasurementSheetSection) => {
    const confirmed = await confirm({
      title: 'Sectie verwijderen',
      message: `Weet je zeker dat je de sectie "${section.name}" en alle velden wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteSection.mutateAsync(section.id);
      showToast('Sectie verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {sorted.length} {sorted.length === 1 ? 'sectie' : 'secties'}
        </p>
        {canEdit && <Button onClick={openCreateSection}>Sectie toevoegen</Button>}
      </div>

      {sorted.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-gray-500">
            Nog geen secties. {canEdit && 'Klik op "Sectie toevoegen" om te beginnen.'}
          </p>
        </Card>
      ) : (
        <SortableList
          items={sorted}
          getId={(s) => s.id}
          disabled={!canEdit}
          onReorder={(ids) => reorderSections.mutate(ids)}
          className="space-y-4"
          renderItem={(section, { dragHandleProps }) => (
            <SectionCard
              key={section.id}
              templateId={templateId}
              section={section}
              canEdit={canEdit}
              dragHandleProps={dragHandleProps}
              onEditSection={() => openEditSection(section)}
              onDeleteSection={() => handleDeleteSection(section)}
              onAddField={() => setFieldCtx({ section, field: null })}
              onEditField={(field) => setFieldCtx({ section, field })}
              fieldTypeLabels={FIELD_TYPE_LABELS}
            />
          )}
        />
      )}

      <SectionModal
        isOpen={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        templateId={templateId}
        section={editingSection}
      />

      {fieldCtx && (
        <FieldModal
          isOpen={!!fieldCtx}
          onClose={() => setFieldCtx(null)}
          templateId={templateId}
          section={fieldCtx.section}
          field={fieldCtx.field}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sectie-kaart met geneste sleepbare veldenlijst
// ---------------------------------------------------------------------------

interface SectionCardProps {
  templateId: string;
  section: MeasurementSheetSection;
  canEdit: boolean;
  dragHandleProps: Record<string, unknown>;
  onEditSection: () => void;
  onDeleteSection: () => void;
  onAddField: () => void;
  onEditField: (field: MeasurementSheetField) => void;
  fieldTypeLabels: Record<MeasurementSheetFieldType, string>;
}

function SectionCard({
  templateId,
  section,
  canEdit,
  dragHandleProps,
  onEditSection,
  onDeleteSection,
  onAddField,
  onEditField,
  fieldTypeLabels,
}: SectionCardProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const reorderFields = useReorderFields(templateId, section.id);
  const deleteField = useDeleteField(templateId, section.id);

  const fields = [...(section.fields ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleDeleteField = async (field: MeasurementSheetField) => {
    const confirmed = await confirm({
      title: 'Veld verwijderen',
      message: `Weet je zeker dat je het veld "${field.name}" wilt verwijderen?`,
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

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Sectie-header */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        {canEdit && <DragHandle {...dragHandleProps} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{section.name}</span>
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              {section.code}
            </code>
            {section.isRepeating && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                Herhalend
              </span>
            )}
            {section.collapsible && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                Inklapbaar
              </span>
            )}
          </div>
          {section.description && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{section.description}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEditSection}>
              Bewerken
            </Button>
            <Button variant="ghost" size="sm" onClick={onDeleteSection}>
              Verwijderen
            </Button>
          </div>
        )}
      </div>

      {/* Velden */}
      <div className="p-4">
        {fields.length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-500">
            Nog geen velden in deze sectie.
          </p>
        ) : (
          <SortableList
            items={fields}
            getId={(f) => f.id}
            disabled={!canEdit}
            onReorder={(ids) => reorderFields.mutate(ids)}
            className="space-y-2"
            renderItem={(field, { dragHandleProps: fieldDrag }) => (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                {canEdit && <DragHandle {...fieldDrag} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{field.name}</span>
                    <code className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-600">
                      {field.code}
                    </code>
                    <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      {fieldTypeLabels[field.fieldType]}
                    </span>
                    {field.unit && <span className="text-xs text-gray-400">{field.unit}</span>}
                    {field.isRequired && (
                      <span className="inline-flex items-center rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-700">
                        Verplicht
                      </span>
                    )}
                    {field.passFailEnabled && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        Pass/fail
                      </span>
                    )}
                    {field.autoFindingEnabled && (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                        Auto-constatering
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEditField(field)}>
                      Bewerken
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteField(field)}>
                      Verwijderen
                    </Button>
                  </div>
                )}
              </div>
            )}
          />
        )}

        {canEdit && (
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onAddField}>
              Veld toevoegen
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
