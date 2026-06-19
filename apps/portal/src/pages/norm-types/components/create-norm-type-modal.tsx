// Aanmaak-modal voor een normtype (alleen SUPERUSER). Bij succes → navigeer naar detail.
// NB: code is in HOOFDLETTERS (/^[A-Z0-9_]+$/), label is de weergavenaam.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useClassificationModels } from '@/pages/classification-models/hooks/use-classification-models';
import { useCreateNormType } from '../hooks/use-norm-types';

const schema = z.object({
  code: z
    .string()
    .min(2, 'Minimaal 2 tekens')
    .max(50, 'Maximaal 50 tekens')
    .regex(/^[A-Z0-9_]+$/, 'alleen hoofdletters, cijfers of underscores'),
  label: z.string().min(2, 'Minimaal 2 tekens').max(200, 'Maximaal 200 tekens'),
  description: z.string().optional(),
  assetTypes: z.string().optional(),
  classificationModelId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateNormTypeModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateNormType();
  const { data: models } = useClassificationModels();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({
        code: '',
        label: '',
        description: '',
        assetTypes: '',
        classificationModelId: '',
        sortOrder: 0,
      });
    }
  }, [isOpen, reset]);

  const modelOptions = [
    { value: '', label: '— Geen —' },
    ...(models ?? []).map((m) => ({ value: m.id, label: m.name })),
  ];

  const onSubmit = async (data: FormData) => {
    const assetTypes = (data.assetTypes ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const created = await createMutation.mutateAsync({
        code: data.code,
        label: data.label,
        description: data.description || undefined,
        assetTypes,
        classificationModelId: data.classificationModelId || undefined,
        sortOrder: data.sortOrder,
      });
      showToast('Normtype aangemaakt', 'success');
      onClose();
      navigate(`/norm-types/${created.id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Aanmaken mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuw normtype">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Code" placeholder="bijv. NEN1010" error={errors.code?.message} {...register('code')} />
          <Input label="Label" placeholder="Weergavenaam" error={errors.label?.message} {...register('label')} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <Input
          label="Asset-types"
          placeholder="komma-gescheiden codes, bijv. pomp, leiding"
          helperText="Asset-type codes die bij deze norm horen. Scheid meerdere met een komma."
          {...register('assetTypes')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Classificatiemodel"
            options={modelOptions}
            error={errors.classificationModelId?.message}
            {...register('classificationModelId')}
          />
          <Input label="Volgorde" type="number" min={0} {...register('sortOrder')} />
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
