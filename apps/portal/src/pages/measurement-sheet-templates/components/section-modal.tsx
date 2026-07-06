// Aanmaak/bewerk-modal voor een meetstaat-sectie. Spiegelt asset-type-field-modal:
// useForm + zodResolver, seed in useEffect bij open, create vs update conditioneel.
// `code` is immutable op bewerken (niet meegestuurd in PATCH).

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Checkbox, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { MeasurementSheetSection } from '@/types';
import { useCreateSection, useUpdateSection } from '../hooks/use-measurement-sheet-templates';

const schema = z.object({
  code: z
    .string()
    .min(2, 'Minimaal 2 tekens')
    .max(50, 'Maximaal 50 tekens')
    .regex(/^[a-z0-9_]+$/, 'alleen kleine letters, cijfers en _'),
  name: z.string().min(2, 'Minimaal 2 tekens').max(200, 'Maximaal 200 tekens'),
  description: z.string().max(1000).optional(),
  isRepeating: z.boolean().optional(),
  minRows: z.coerce.number().int().min(0).optional(),
  collapsible: z.boolean().optional(),
  defaultCollapsed: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  /** Bestaande sectie → bewerk-modus; afwezig → aanmaak-modus. */
  section?: MeasurementSheetSection | null;
}

export function SectionModal({ isOpen, onClose, templateId, section }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateSection(templateId);
  const updateMutation = useUpdateSection(templateId);
  const isEdit = !!section;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!isOpen) return;
    reset({
      code: section?.code ?? '',
      name: section?.name ?? '',
      description: section?.description ?? '',
      isRepeating: section?.isRepeating ?? false,
      minRows: section?.minRows ?? 0,
      collapsible: section?.collapsible ?? false,
      defaultCollapsed: section?.defaultCollapsed ?? false,
    });
  }, [isOpen, section, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && section) {
        await updateMutation.mutateAsync({
          sectionId: section.id,
          data: {
            name: data.name,
            description: data.description || undefined,
            isRepeating: data.isRepeating ?? false,
            minRows: data.minRows ?? 0,
            collapsible: data.collapsible ?? false,
            defaultCollapsed: data.defaultCollapsed ?? false,
          },
        });
        showToast('Sectie bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({
          code: data.code,
          name: data.name,
          description: data.description || undefined,
          isRepeating: data.isRepeating ?? false,
          minRows: data.minRows ?? 0,
          collapsible: data.collapsible ?? false,
          defaultCollapsed: data.defaultCollapsed ?? false,
        });
        showToast('Sectie toegevoegd', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Sectie bewerken' : 'Sectie toevoegen'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            placeholder="bijv. algemeen"
            error={errors.code?.message}
            disabled={isEdit}
            {...register('code')}
          />
          <Input
            label="Naam"
            placeholder="Weergavenaam"
            error={errors.name?.message}
            {...register('name')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <Checkbox label="Herhalende sectie (rijen)" {...register('isRepeating')} />
          <Input
            label="Minimaal aantal rijen"
            type="number"
            min={0}
            {...register('minRows')}
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <Checkbox label="Inklapbaar" {...register('collapsible')} />
          <Checkbox label="Standaard ingeklapt" {...register('defaultCollapsed')} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
