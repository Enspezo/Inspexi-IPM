// Aanmaak-modal voor een checklist. Bij succes → navigeer naar de nieuwe detailpagina.

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useNormTypes } from '@/pages/norm-types/hooks/use-norm-types';
import { useCreateChecklist } from '../hooks/use-checklists';

const schema = z.object({
  name: z.string().min(3, 'Minimaal 3 tekens'),
  code: z.string().optional(),
  description: z.string().optional(),
  normTypeCode: z.string().min(1, 'Normtype is verplicht'),
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

export function CreateChecklistModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateChecklist();
  const { data: normTypes } = useNormTypes();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({
        name: '',
        code: '',
        description: '',
        normTypeCode: '',
        assetTypes: '',
        locationTypes: '',
      });
    }
  }, [isOpen, reset]);

  const normTypeOptions = useMemo(
    () => (normTypes ?? []).map((n) => ({ value: n.code, label: `${n.label} (${n.code})` })),
    [normTypes],
  );

  const onSubmit = async (data: FormData) => {
    try {
      const created = await createMutation.mutateAsync({
        name: data.name,
        code: data.code || undefined,
        description: data.description || undefined,
        normTypeCode: data.normTypeCode,
        assetTypes: csvToArray(data.assetTypes),
        locationTypes: csvToArray(data.locationTypes),
      });
      showToast('Checklist aangemaakt', 'success');
      onClose();
      navigate(`/checklists/${created.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuwe checklist">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Naam" placeholder="bijv. Inspectie verdeelinrichting" error={errors.name?.message} {...register('name')} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Code (optioneel)" placeholder="bijv. CL-NEN1010" {...register('code')} />
          <Select
            label="Normtype"
            placeholder="Kies een normtype"
            options={normTypeOptions}
            error={errors.normTypeCode?.message}
            {...register('normTypeCode')}
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

        <Input
          label="Asset-types"
          placeholder="komma-gescheiden, bijv. verdeler, pomp"
          helperText="Asset-type codes waarvoor de checklist geldt."
          error={errors.assetTypes?.message}
          {...register('assetTypes')}
        />

        <Input
          label="Locatie-types (optioneel)"
          placeholder="komma-gescheiden"
          {...register('locationTypes')}
        />

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
