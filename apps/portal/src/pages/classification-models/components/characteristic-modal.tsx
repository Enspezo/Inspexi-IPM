// Aanmaak/bewerk-modal voor een kenmerk (characteristic) van een classificatiemodel.
// Spiegelt asset-type-field-modal: useForm + zodResolver, seed in useEffect bij open,
// create vs update conditioneel. Code is immutable bij bewerken (backend accepteert geen code-wijziging).

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { ClassificationCharacteristic } from '@/types';
import { useCreateCharacteristic, useUpdateCharacteristic } from '../hooks/use-classification-models';

const schema = z.object({
  code: z
    .string()
    .min(1, 'Code is verplicht')
    .max(50, 'Maximaal 50 tekens')
    .regex(/^[A-Z0-9_]+$/, 'alleen hoofdletters, cijfers en _'),
  name: z.string().min(1, 'Naam is verplicht').max(100, 'Maximaal 100 tekens'),
  description: z.string().max(500, 'Maximaal 500 tekens').optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
  /** Bestaand kenmerk → bewerk-modus; afwezig → aanmaak-modus. */
  characteristic?: ClassificationCharacteristic | null;
}

export function CharacteristicModal({ isOpen, onClose, modelId, characteristic }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateCharacteristic(modelId);
  const updateMutation = useUpdateCharacteristic(modelId);
  const isEdit = !!characteristic;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!isOpen) return;
    reset({
      code: characteristic?.code ?? '',
      name: characteristic?.name ?? '',
      description: characteristic?.description ?? '',
    });
  }, [isOpen, characteristic, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && characteristic) {
        // code is immutable → niet meesturen op update.
        await updateMutation.mutateAsync({
          charId: characteristic.id,
          data: {
            name: data.name,
            description: data.description || null,
          },
        });
        showToast('Kenmerk bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({
          code: data.code,
          name: data.name,
          description: data.description || undefined,
        });
        showToast('Kenmerk toegevoegd', 'success');
      }
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Kenmerk bewerken' : 'Kenmerk toevoegen'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Code"
          placeholder="bijv. STATUS"
          error={errors.code?.message}
          disabled={isEdit}
          helperText={isEdit ? 'De code kan niet worden gewijzigd.' : 'Hoofdletters, cijfers en underscores.'}
          {...register('code')}
        />
        <Input label="Naam" placeholder="Weergavenaam" error={errors.name?.message} {...register('name')} />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
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
