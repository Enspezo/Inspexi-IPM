// Aanmaak-modal voor een eigen (org-)inspectie-template. Bij succes → navigeer naar
// de nieuwe detailpagina zodat de gebruiker meteen de document-builder in kan.
// Backend: POST /inspection-templates maakt altijd een org-template (CONCEPT) voor org-admins.

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useNormTypes } from '@/pages/norm-types/hooks/use-norm-types';
import { useClassificationModels } from '@/pages/classification-models/hooks/use-classification-models';
import { useCreateInspectionTemplate } from '../hooks/use-inspection-templates';

const schema = z.object({
  code: z.string().min(2, 'Minimaal 2 tekens').max(50, 'Maximaal 50 tekens'),
  name: z.string().min(3, 'Minimaal 3 tekens').max(200, 'Maximaal 200 tekens'),
  description: z.string().max(2000, 'Maximaal 2000 tekens').optional(),
  normTypeCode: z.string().min(1, 'Normtype is verplicht'),
  classificationModelId: z.string().uuid('Kies een classificatiemodel'),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateInspectionTemplateModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateInspectionTemplate();
  const { data: normTypes } = useNormTypes();
  const { data: classificationModels } = useClassificationModels();

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
        name: '',
        description: '',
        normTypeCode: '',
        classificationModelId: '',
      });
    }
  }, [isOpen, reset]);

  const normTypeOptions = useMemo(
    () => (normTypes ?? []).map((n) => ({ value: n.code, label: `${n.label} (${n.code})` })),
    [normTypes],
  );

  const classificationOptions = useMemo(
    () => (classificationModels ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    [classificationModels],
  );

  const onSubmit = async (data: FormData) => {
    try {
      const created = await createMutation.mutateAsync({
        code: data.code,
        name: data.name,
        description: data.description || undefined,
        normTypeCode: data.normTypeCode,
        classificationModelId: data.classificationModelId,
      });
      showToast('Inspectie-template aangemaakt', 'success');
      onClose();
      navigate(`/inspection-templates/${created.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuwe inspectie-template">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="bijv. NEN 1010 Inspectie"
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            placeholder="bijv. NEN1010-INSP"
            error={errors.code?.message}
            {...register('code')}
          />
          <Select
            label="Normtype"
            placeholder="Kies een normtype"
            options={normTypeOptions}
            error={errors.normTypeCode?.message}
            {...register('normTypeCode')}
          />
        </div>

        <Select
          label="Classificatiemodel"
          placeholder="Kies een classificatiemodel"
          options={classificationOptions}
          error={errors.classificationModelId?.message}
          {...register('classificationModelId')}
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
