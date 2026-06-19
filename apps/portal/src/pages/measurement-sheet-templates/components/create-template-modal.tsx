// Aanmaak-modal voor een meetstaat-template. Bij succes → navigeer naar de detailpagina.
// ⚠️ CREATE-body gebruikt `normType` (de RESPONSE/entity gebruikt normTypeCode).
// normType-Select uit useNormTypes() (value = code, label = label).
// assetTypes / locationTypes als komma-gescheiden tekst → string[].

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useNormTypes } from '@/pages/norm-types/hooks/use-norm-types';
import { useCreateMeasurementSheetTemplate } from '../hooks/use-measurement-sheet-templates';

const schema = z.object({
  code: z
    .string()
    .min(2, 'Minimaal 2 tekens')
    .max(50, 'Maximaal 50 tekens')
    .regex(/^[A-Z0-9_-]+$/, 'alleen hoofdletters, cijfers, _ en -'),
  name: z.string().min(3, 'Minimaal 3 tekens').max(200, 'Maximaal 200 tekens'),
  description: z.string().max(2000).optional(),
  normType: z.string().min(1, 'Normtype is verplicht'),
  assetTypes: z.string().min(1, 'Minimaal één asset-type'),
  locationTypes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function csvToArray(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CreateTemplateModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateMeasurementSheetTemplate();
  const { data: normTypes } = useNormTypes();

  const normTypeOptions = (normTypes ?? []).map((n) => ({ value: n.code, label: n.label }));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ code: '', name: '', description: '', normType: '', assetTypes: '', locationTypes: '' });
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      const created = await createMutation.mutateAsync({
        code: data.code,
        name: data.name,
        description: data.description || undefined,
        normType: data.normType, // create-body gebruikt normType
        assetTypes: csvToArray(data.assetTypes),
        locationTypes: csvToArray(data.locationTypes),
      });
      showToast('Meetstaat-template aangemaakt', 'success');
      onClose();
      navigate(`/measurement-sheet-templates/${created.id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Aanmaken mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuwe meetstaat-template">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            placeholder="bijv. NEN1010_HOOFDVERDELER"
            error={errors.code?.message}
            {...register('code')}
          />
          <Input
            label="Naam"
            placeholder="Weergavenaam"
            error={errors.name?.message}
            {...register('name')}
          />
        </div>

        <Select
          label="Normtype"
          placeholder="Kies een normtype"
          options={normTypeOptions}
          error={errors.normType?.message}
          {...register('normType')}
        />

        <Input
          label="Asset-types"
          placeholder="komma-gescheiden, bijv. hoofdverdeler, groepenkast"
          helperText="Scheid meerdere asset-types met een komma."
          error={errors.assetTypes?.message}
          {...register('assetTypes')}
        />

        <Input
          label="Locatie-types (optioneel)"
          placeholder="komma-gescheiden"
          helperText="Scheid meerdere locatie-types met een komma."
          {...register('locationTypes')}
        />

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
          <Button type="submit" isLoading={createMutation.isPending}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
