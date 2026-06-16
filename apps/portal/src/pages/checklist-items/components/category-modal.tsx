// Aanmaak/bewerk-modal voor een categorie (gedeelde taxonomie, @/lib/categories).
// Velden: naam (verplicht), omschrijving, kleur, icoon, bovenliggende categorie (optioneel).

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useCreateCategory, useUpdateCategory } from '@/lib/categories';
import type { Category } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  parentId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Bestaande categorie → bewerk-modus; afwezig → aanmaak-modus. */
  category?: Category | null;
  /** Alle categorieën (voor de parent-keuze); de huidige wordt eruit gefilterd. */
  allCategories: Category[];
  /** Aanmaken als systeemcategorie (alleen SUPERUSER). */
  asSystem?: boolean;
}

export function CategoryModal({ isOpen, onClose, category, allCategories, asSystem }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const isEdit = !!category;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({
        name: category?.name ?? '',
        description: category?.description ?? '',
        color: category?.color ?? '#6B7280',
        icon: category?.icon ?? '',
        parentId: category?.parentId ?? '',
      });
    }
  }, [isOpen, category, reset]);

  const parentOptions = useMemo(
    () => [
      { value: '', label: 'Geen (hoofdcategorie)' },
      ...allCategories
        .filter((c) => c.id !== category?.id)
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [allCategories, category],
  );

  const onSubmit = async (data: FormData) => {
    const payload = {
      name: data.name,
      description: data.description || null,
      color: data.color || null,
      icon: data.icon || null,
      parentId: data.parentId || null,
    };
    try {
      if (isEdit && category) {
        await updateMutation.mutateAsync({ id: category.id, data: payload });
        showToast('Categorie bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({ ...payload, isSystem: asSystem });
        showToast('Categorie toegevoegd', 'success');
      }
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Categorie bewerken' : 'Nieuwe categorie'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Naam" placeholder="bijv. Verdeelinrichting" error={errors.name?.message} {...register('name')} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Kleur" type="color" {...register('color')} />
          <Input label="Icoon" placeholder="bijv. folder" {...register('icon')} />
        </div>

        <Select label="Bovenliggende categorie" options={parentOptions} {...register('parentId')} />

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
