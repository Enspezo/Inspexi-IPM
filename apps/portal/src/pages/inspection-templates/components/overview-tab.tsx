// Overzicht-tab van de inspectie-template: lees-modus (InfoField) met een inline
// bewerk-modus (alleen CONCEPT). Bewerkbaar zijn naam, classificatiemodel en
// omschrijving; code / normtype / versie / herkomst blijven read-only (backend
// staat die niet toe via PATCH).

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, InfoField, Input, Select, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { InspectionTemplate } from '@/types';
import { useClassificationModels } from '@/pages/classification-models/hooks/use-classification-models';
import { useUpdateInspectionTemplate } from '../hooks/use-inspection-templates';

const schema = z.object({
  name: z.string().min(3, 'Minimaal 3 tekens').max(200, 'Maximaal 200 tekens'),
  classificationModelId: z.string().uuid('Kies een classificatiemodel'),
  description: z.string().max(2000, 'Maximaal 2000 tekens').optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  template: InspectionTemplate;
  /** Inline bewerken toegestaan (beheerder + status CONCEPT). */
  canEdit: boolean;
}

export function OverviewTab({ template, canEdit }: Props) {
  const { showToast } = useToast();
  const updateMutation = useUpdateInspectionTemplate();
  const { data: classificationModels } = useClassificationModels();
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    reset({
      name: template.name,
      classificationModelId: template.classificationModelId,
      description: template.description ?? '',
    });
  }, [template, reset]);

  const classificationOptions = useMemo(
    () => (classificationModels ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    [classificationModels],
  );

  const cancel = () => {
    reset({
      name: template.name,
      classificationModelId: template.classificationModelId,
      description: template.description ?? '',
    });
    setIsEditing(false);
  };

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        data: {
          name: data.name,
          classificationModelId: data.classificationModelId,
          description: data.description || undefined,
        },
      });
      showToast('Inspectie-template bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  if (!isEditing) {
    return (
      <Card
        title="Templategegevens"
        actions={
          canEdit ? (
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
              Bewerken
            </Button>
          ) : undefined
        }
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoField label="Naam" value={template.name} />
          <InfoField label="Code" value={template.code} />
          <InfoField label="Normtype" value={template.normTypeCode} />
          <InfoField label="Versie" value={template.version} />
          <InfoField label="Classificatiemodel" value={template.classificationModel?.name} />
          <InfoField label="Herkomst" value={template.isSystem ? 'Systeem' : 'Eigen'} />
          <InfoField label="Aangemaakt" value={formatDate(template.createdAt)} />
          <InfoField label="Bijgewerkt" value={formatDate(template.updatedAt)} />
          <div className="sm:col-span-2">
            <InfoField label="Beschrijving" value={template.description} />
          </div>
        </dl>
      </Card>
    );
  }

  return (
    <Card title="Templategegevens bewerken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Naam" error={errors.name?.message} {...register('name')} />
          <Select
            label="Classificatiemodel"
            placeholder="Kies een classificatiemodel"
            options={classificationOptions}
            error={errors.classificationModelId?.message}
            {...register('classificationModelId')}
          />
          {/* Read-only context — niet bewerkbaar via PATCH */}
          <InfoField label="Code" value={template.code} />
          <InfoField label="Normtype" value={template.normTypeCode} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Beschrijving</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          {errors.description && (
            <p className="mt-1 text-sm text-danger-600">{errors.description.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={cancel}>
            Annuleren
          </Button>
          <Button type="submit" disabled={!isDirty} isLoading={updateMutation.isPending}>
            Opslaan
          </Button>
        </div>
      </form>
    </Card>
  );
}
