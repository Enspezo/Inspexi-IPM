import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useCreateEmailTemplate } from '../hooks/use-email-templates';
import { EmailTemplateType } from '@/types';
import { EMAIL_TYPE_LABELS } from './email-type-labels';
import { getErrorMessage } from '@/lib/api-client';

const schema = z.object({
  type: z.nativeEnum(EmailTemplateType),
  name: z.string().min(1, 'Naam is verplicht'),
  subject: z.string().min(1, 'Onderwerp is verplicht'),
});

type FormValues = z.infer<typeof schema>;

interface CreateEmailTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (template: { id: string }) => void;
}

const typeOptions = Object.entries(EMAIL_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function CreateEmailTemplateModal({ isOpen, onClose, onCreated }: CreateEmailTemplateModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateEmailTemplate();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: EmailTemplateType.OFFERTE_VERSTUURD,
      name: '',
      subject: '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const result = await createMutation.mutateAsync({
        ...data,
        bodyHtml: '<p></p>',
        bodyJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      });
      showToast('E-mailsjabloon aangemaakt', 'success');
      reset();
      onClose();
      onCreated?.(result);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuw e-mailsjabloon">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          label="Type"
          options={typeOptions}
          {...register('type')}
          error={errors.type?.message}
        />

        <Input
          label="Naam"
          placeholder="bijv. Offerte verstuurd - standaard"
          {...register('name')}
          error={errors.name?.message}
        />

        <Input
          label="Onderwerp"
          placeholder="bijv. Uw offerte {{offerte.nummer}} van {{organisatie.naam}}"
          {...register('subject')}
          error={errors.subject?.message}
        />

        <p className="text-xs text-gray-500">
          Na het aanmaken kunt u de inhoud bewerken met de rich text editor.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Aanmaken...' : 'Aanmaken'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
