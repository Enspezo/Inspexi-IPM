import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, ErrorBox, Spinner, useToast } from '@/components/ui';
import { useCreatePlan, useFeatureCatalog } from '../hooks/use-plans';
import { FeatureChecklist } from './feature-checklist';

const planSchema = z.object({
  name: z.string().min(2, 'Naam moet minimaal 2 tekens bevatten'),
  slug: z
    .string()
    .min(1, 'Slug is verplicht')
    .regex(/^[a-z0-9]+$/, 'Slug mag alleen kleine letters en cijfers bevatten'),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

type PlanFormData = z.infer<typeof planSchema>;

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePlanModal({ isOpen, onClose }: CreatePlanModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreatePlan();
  const { data: catalog, isLoading: catalogLoading } = useFeatureCatalog();
  const [slugTouched, setSlugTouched] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: { name: '', slug: '', description: '', sortOrder: 0 },
  });

  const name = watch('name');

  useEffect(() => {
    if (!slugTouched && name) {
      setValue('slug', name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  }, [name, slugTouched, setValue]);

  const handleClose = () => {
    reset();
    setSlugTouched(false);
    setSelected([]);
    onClose();
  };

  const onSubmit = async (data: PlanFormData) => {
    try {
      await createMutation.mutateAsync({
        name: data.name,
        slug: data.slug,
        description: data.description || undefined,
        sortOrder: data.sortOrder ?? 0,
        featureKeys: selected,
      });
      showToast('Abonnement aangemaakt', 'success');
      handleClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aanmaken mislukt', 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Abonnement aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Naam"
            placeholder="Basis"
            error={errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Slug"
            placeholder="basis"
            helperText="Stabiele identifier, geen koppeltekens"
            error={errors.slug?.message}
            {...register('slug', { onChange: () => setSlugTouched(true) })}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Beschrijving
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Korte omschrijving van het abonnement"
            {...register('description')}
          />
        </div>

        <Input
          label="Sorteervolgorde"
          type="number"
          helperText="Lager = hoger in de lijst"
          error={errors.sortOrder?.message}
          {...register('sortOrder')}
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Functies in dit abonnement
          </label>
          {catalogLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : catalog ? (
            <FeatureChecklist
              catalog={catalog}
              selected={selected}
              onChange={setSelected}
            />
          ) : (
            <ErrorBox>Feature-catalogus kon niet geladen worden</ErrorBox>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
