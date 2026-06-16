// Herbruikbare modal voor checklist-lifecycle-acties (publiceren / intrekken / nieuwe versie).
// changeDescription is verplicht voor publiceren/intrekken (5-500), optioneel voor nieuwe versie.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button } from '@/components/ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Tekst op de bevestig-knop. */
  confirmLabel: string;
  /** Toon het reden-veld (approvalReason). */
  withApprovalReason?: boolean;
  /** changeDescription verplicht (publiceren/intrekken) of optioneel (nieuwe versie). */
  descriptionRequired?: boolean;
  isLoading?: boolean;
  onSubmit: (data: { changeDescription?: string; approvalReason?: string }) => void;
}

export function LifecycleModal({
  isOpen,
  onClose,
  title,
  confirmLabel,
  withApprovalReason = false,
  descriptionRequired = true,
  isLoading,
  onSubmit,
}: Props) {
  const schema = z.object({
    changeDescription: descriptionRequired
      ? z
          .string()
          .min(5, 'Minimaal 5 tekens')
          .max(500, 'Maximaal 500 tekens')
      : z.string().max(500, 'Maximaal 500 tekens').optional(),
    approvalReason: z.string().max(500, 'Maximaal 500 tekens').optional(),
  });
  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) reset({ changeDescription: '', approvalReason: '' });
  }, [isOpen, reset]);

  const submit = (data: FormData) => {
    onSubmit({
      changeDescription: data.changeDescription || undefined,
      approvalReason: data.approvalReason || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Omschrijving van de wijziging{descriptionRequired ? '' : ' (optioneel)'}
          </label>
          <textarea
            {...register('changeDescription')}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          {errors.changeDescription && (
            <p className="mt-1 text-sm text-danger-600">{errors.changeDescription.message}</p>
          )}
        </div>

        {withApprovalReason && (
          <Input
            label="Reden van goedkeuring (optioneel)"
            error={errors.approvalReason?.message}
            {...register('approvalReason')}
          />
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
