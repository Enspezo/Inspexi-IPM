// Aanmaak/bewerk-modal voor een checklist-item (bibliotheek).
// Velden: vraag (verplicht), werkinstructie, normverwijzing, categorie, code.

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useCategories } from '@/lib/categories';
import type { ChecklistItem } from '@/types';
import { useCreateChecklistItem, useUpdateChecklistItem } from '../hooks/use-checklist-items';

const schema = z.object({
  question: z.string().min(5, 'Minimaal 5 tekens').max(500, 'Maximaal 500 tekens'),
  instruction: z.string().optional(),
  normReference: z.string().optional(),
  categoryId: z.string().optional(),
  code: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Bestaand item → bewerk-modus; afwezig → aanmaak-modus. */
  item?: ChecklistItem | null;
  /** Aanmaken als systeem-item (alleen SUPERUSER). */
  asSystem?: boolean;
}

export function ChecklistItemModal({ isOpen, onClose, item, asSystem }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateChecklistItem();
  const updateMutation = useUpdateChecklistItem();
  const { data: categories } = useCategories();
  const isEdit = !!item;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({
        question: item?.question ?? '',
        instruction: item?.instruction ?? '',
        normReference: item?.normReference ?? '',
        categoryId: item?.categoryId ?? '',
        code: item?.code ?? '',
      });
    }
  }, [isOpen, item, reset]);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Geen categorie' },
      ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  const onSubmit = async (data: FormData) => {
    const payload = {
      question: data.question,
      instruction: data.instruction || undefined,
      normReference: data.normReference || undefined,
      categoryId: data.categoryId || undefined,
      code: data.code || undefined,
    };
    try {
      if (isEdit && item) {
        await updateMutation.mutateAsync({ id: item.id, data: payload });
        showToast('Item bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({ ...payload, isSystem: asSystem });
        showToast('Item toegevoegd', 'success');
      }
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Item bewerken' : 'Nieuw item'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Vraag</label>
          <textarea
            {...register('question')}
            rows={2}
            placeholder="bijv. Is de hoofdschakelaar goed bereikbaar?"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          {errors.question && <p className="mt-1 text-sm text-danger-600">{errors.question.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Werkinstructie</label>
          <textarea
            {...register('instruction')}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Normverwijzing" placeholder="bijv. NEN 1010 art. 5.3" {...register('normReference')} />
          <Input label="Code (optioneel)" placeholder="bijv. NEN1010-001" {...register('code')} />
        </div>

        <Select label="Categorie" options={categoryOptions} {...register('categoryId')} />

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
