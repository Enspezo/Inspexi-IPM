// Aanmaak-modal voor een classificatiemodel. Bij succes → navigeer naar de detailpagina,
// waar kenmerken en opties worden toegevoegd. De backend-DTO laat een leeg `characteristics`-
// array toe, dus we maken het model leeg aan en vullen het daarna in de editor.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useCreateClassificationModel } from '../hooks/use-classification-models';

const schema = z.object({
  code: z
    .string()
    .min(1, 'Code is verplicht')
    .max(50, 'Maximaal 50 tekens')
    .regex(/^[A-Z0-9_-]+$/, 'alleen hoofdletters, cijfers, _ en -'),
  name: z.string().min(1, 'Naam is verplicht').max(100, 'Maximaal 100 tekens'),
  description: z.string().max(500, 'Maximaal 500 tekens').optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateClassificationModelModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateClassificationModel();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ code: '', name: '', description: '' });
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      const created = await createMutation.mutateAsync({
        code: data.code,
        name: data.name,
        description: data.description || undefined,
        characteristics: [],
      });
      showToast('Classificatiemodel aangemaakt', 'success');
      onClose();
      navigate(`/classification-models/${created.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuw classificatiemodel">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Code"
          placeholder="bijv. NEN1010_AFKEUR"
          error={errors.code?.message}
          helperText="Hoofdletters, cijfers, underscores en streepjes."
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

        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Kenmerken en opties voeg je toe na het aanmaken, op de detailpagina.
        </p>

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
