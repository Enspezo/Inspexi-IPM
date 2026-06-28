// Aanmaak-modal voor een asset onder een inspectieplan. Bij succes → assets-lijst ververst.
// Met vaste `planId` (assets-tab op de inspectie-detail) óf met een plan-selector
// (org-breed assetregister, /assets) wanneer er geen plan-context is.
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useAssetTypes } from '@/pages/asset-types/hooks/use-asset-types';
import { useCreateAsset } from '../hooks/use-location-images';
import { useInspectionPlans } from '../hooks/use-inspections';

const schema = z.object({
  planId: z.string().optional(),
  assetType: z.string().min(1, 'Asset-type is verplicht'),
  name: z.string().min(1, 'Naam is verplicht'),
  identifier: z.string().optional(),
  locationDescription: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Vast plan (assets-tab). Weglaten → plan-selector tonen (org-breed register). */
  planId?: string;
}

export function CreateAssetModal({ isOpen, onClose, planId }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateAsset();
  const { data: assetTypes } = useAssetTypes();

  const needsPlanSelect = !planId;
  // Plannen alleen ophalen wanneer de selector nodig is en de modal open is.
  const { data: plansData } = useInspectionPlans(
    needsPlanSelect && isOpen ? { limit: 200, sortBy: 'createdAt', sortOrder: 'desc' } : {},
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ planId: '', assetType: '', name: '', identifier: '', locationDescription: '', notes: '' });
    }
  }, [isOpen, reset]);

  const assetTypeOptions = useMemo(
    () => [
      { value: '', label: '— Kies asset-type —' },
      ...(assetTypes ?? [])
        .filter((t) => t.isActive)
        .map((t) => ({ value: t.code, label: t.name })),
    ],
    [assetTypes],
  );

  const planOptions = useMemo(
    () => [
      { value: '', label: '— Kies inspectie —' },
      ...(plansData?.data ?? []).map((p) => ({ value: p.id, label: p.projectName })),
    ],
    [plansData],
  );

  const onSubmit = async (data: FormData) => {
    const targetPlanId = planId ?? data.planId;
    if (!targetPlanId) {
      showToast('Kies een inspectie om de asset aan te koppelen', 'error');
      return;
    }
    try {
      await createMutation.mutateAsync({
        planId: targetPlanId,
        data: {
          assetType: data.assetType,
          name: data.name,
          identifier: data.identifier || undefined,
          locationDescription: data.locationDescription || undefined,
          notes: data.notes || undefined,
        },
      });
      showToast('Asset aangemaakt', 'success');
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Aanmaken mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuwe asset">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {needsPlanSelect && (
          <Select
            label="Inspectie"
            options={planOptions}
            error={errors.planId?.message}
            {...register('planId')}
          />
        )}

        <Select
          label="Asset-type"
          options={assetTypeOptions}
          error={errors.assetType?.message}
          {...register('assetType')}
        />

        <Input
          label="Naam"
          placeholder="bijv. Hoofdverdeler"
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Identificatie" placeholder="optioneel" {...register('identifier')} />
          <Input label="Locatie" placeholder="bijv. Technische ruimte" {...register('locationDescription')} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notities</label>
          <textarea
            {...register('notes')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
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
