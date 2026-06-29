// Aanmaak-modal voor een asset-type. Bij succes → navigeer naar de nieuwe detailpagina.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useCreateAssetType } from '../hooks/use-asset-types';

const schema = z.object({
  code: z
    .string()
    .min(1, 'Code is verplicht')
    .regex(/^[a-z0-9]+$/, 'alleen kleine letters en cijfers'),
  shortCode: z.string().optional(),
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  normTypes: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateAssetTypeModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateAssetType();

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
        shortCode: '',
        name: '',
        description: '',
        icon: '',
        color: '#6B7280',
        normTypes: '',
        sortOrder: 0,
        isActive: true,
      });
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: FormData) => {
    const normTypes = (data.normTypes ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const created = await createMutation.mutateAsync({
        code: data.code,
        shortCode: data.shortCode || undefined,
        name: data.name,
        description: data.description || undefined,
        icon: data.icon || undefined,
        color: data.color || undefined,
        normTypes,
        sortOrder: data.sortOrder,
        isActive: data.isActive ?? true,
      });
      showToast('Asset-type aangemaakt', 'success');
      onClose();
      navigate(`/asset-types/${created.id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Aanmaken mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuw asset-type">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Code" placeholder="bijv. pomp" error={errors.code?.message} {...register('code')} />
          <Input label="Naam" placeholder="Weergavenaam" error={errors.name?.message} {...register('name')} />
        </div>

        <Input
          label="Shortcode"
          placeholder="bijv. VERD"
          helperText="Gebruikt voor de [typecode]-placeholder in de asset-nummering."
          {...register('shortCode')}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Icoon" placeholder="bijv. wrench" {...register('icon')} />
          <Input label="Kleur" type="color" {...register('color')} />
        </div>

        <Input
          label="Normtypes"
          placeholder="komma-gescheiden, bijv. NEN3140, SCIOS"
          helperText="Scheid meerdere normtypes met een komma."
          {...register('normTypes')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Volgorde" type="number" min={0} {...register('sortOrder')} />
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                {...register('isActive')}
              />
              Actief
            </label>
          </div>
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
