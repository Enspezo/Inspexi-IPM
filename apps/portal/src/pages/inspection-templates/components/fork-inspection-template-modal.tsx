// Fork-modal: kopieer een systeemtemplate naar de eigen organisatie (als CONCEPT).
// Code en naam zijn optioneel; de backend valt terug op '{code}-FORK' / '{naam} (fork)'.
// Bij succes → navigeer naar de nieuwe (eigen) template zodat de builder direct te openen is.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { InspectionTemplate } from '@/types';
import { useForkInspectionTemplate } from '../hooks/use-inspection-templates';

const schema = z.object({
  code: z.string().max(50, 'Maximaal 50 tekens').optional(),
  name: z.string().max(200, 'Maximaal 200 tekens').optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  source: InspectionTemplate;
}

export function ForkInspectionTemplateModal({ isOpen, onClose, source }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const forkMutation = useForkInspectionTemplate();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ code: `${source.code}-FORK`, name: `${source.name} (fork)` });
    }
  }, [isOpen, reset, source.code, source.name]);

  const onSubmit = async (data: FormData) => {
    try {
      const forked = await forkMutation.mutateAsync({
        id: source.id,
        data: {
          code: data.code?.trim() || undefined,
          name: data.name?.trim() || undefined,
        },
      });
      showToast('Template geforkt naar uw organisatie', 'success');
      onClose();
      navigate(`/inspection-templates/${forked.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Systeemtemplate forken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-gray-600">
          Er wordt een bewerkbare kopie (CONCEPT) van <strong>{source.name}</strong> in uw
          organisatie aangemaakt, inclusief de gekoppelde checklists en meetstaten.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Code" error={errors.code?.message} {...register('code')} />
          <Input label="Naam" error={errors.name?.message} {...register('name')} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={forkMutation.isPending}>
            Forken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
