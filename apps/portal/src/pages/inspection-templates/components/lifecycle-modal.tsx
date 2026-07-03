// Herbruikbare modal voor inspectie-template lifecycle-acties
// (publiceren / laten vervallen / nieuwe versie). De toelichting is bij alle acties
// optioneel (de backend-DTO's maken changeDescription/reason optioneel) en landt in
// de versiegeschiedenis.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button } from '@/components/ui';

const schema = z.object({
  note: z.string().max(500, 'Maximaal 500 tekens').optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  noteLabel: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  isLoading?: boolean;
  onConfirm: (note?: string) => void;
}

export function LifecycleModal({
  isOpen,
  onClose,
  title,
  description,
  noteLabel,
  confirmLabel,
  confirmVariant = 'primary',
  isLoading,
  onConfirm,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) reset({ note: '' });
  }, [isOpen, reset]);

  const submit = (data: FormData) => onConfirm(data.note?.trim() || undefined);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <p className="text-sm text-gray-600">{description}</p>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{noteLabel}</label>
          <textarea
            {...register('note')}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          {errors.note && <p className="mt-1 text-sm text-danger-600">{errors.note.message}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" variant={confirmVariant} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
