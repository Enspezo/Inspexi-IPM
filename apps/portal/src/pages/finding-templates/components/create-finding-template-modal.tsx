// Aanmaak-modal voor een constatering-template. Verplicht: omschrijving +
// classificatiemodel (+ standaardclassificatie). Bij succes → navigeer naar de detailpagina.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useCategories } from '@/lib/categories';
import { useClassificationModels } from '@/pages/classification-models/hooks/use-classification-models';
import { useCreateFindingTemplate } from '../hooks/use-finding-templates';
import { DefaultClassificationEditor } from './default-classification-editor';

const schema = z.object({
  shortDescription: z.string().min(1, 'Omschrijving is verplicht'),
  code: z.string().optional(),
  longDescription: z.string().optional(),
  explanation: z.string().optional(),
  normReference: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateFindingTemplateModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateFindingTemplate();
  const { data: categories } = useCategories();
  const { data: models } = useClassificationModels();

  const [modelId, setModelId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [classification, setClassification] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ shortDescription: '', code: '', longDescription: '', explanation: '', normReference: '' });
      setModelId('');
      setCategoryId('');
      setClassification({});
    }
  }, [isOpen, reset]);

  const categoryOptions = [
    { value: '', label: '—' },
    ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.name }));

  // Bij modelwissel: classificatie resetten (oude kenmerkcodes horen niet bij het nieuwe model).
  const handleModelChange = (nextId: string) => {
    setModelId(nextId);
    setClassification({});
  };

  const onSubmit = async (data: FormData) => {
    if (!modelId) {
      showToast('Kies een classificatiemodel', 'error');
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        shortDescription: data.shortDescription,
        code: data.code || undefined,
        longDescription: data.longDescription || undefined,
        explanation: data.explanation || undefined,
        normReference: data.normReference || undefined,
        categoryId: categoryId || undefined,
        classificationModelId: modelId,
        defaultClassification: classification,
      });
      showToast('Constatering-template aangemaakt', 'success');
      onClose();
      navigate(`/finding-templates/${created.id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Aanmaken mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuw constatering-template">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Omschrijving"
          placeholder="Korte omschrijving"
          error={errors.shortDescription?.message}
          {...register('shortDescription')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Code" placeholder="optioneel" {...register('code')} />
          <Select
            label="Categorie"
            options={categoryOptions}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          />
        </div>

        <Select
          label="Classificatiemodel"
          options={modelOptions}
          placeholder="Kies een model"
          value={modelId}
          onChange={(e) => handleModelChange(e.target.value)}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Standaardclassificatie</p>
          <DefaultClassificationEditor
            classificationModelId={modelId}
            value={classification}
            onChange={setClassification}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Toelichting (lang)</label>
          <textarea
            {...register('longDescription')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Uitleg" {...register('explanation')} />
          <Input label="Normreferentie" {...register('normReference')} />
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
