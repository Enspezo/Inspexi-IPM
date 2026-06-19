// Herbruikbare lifecycle-modal voor publiceren / intrekken / nieuwe versie.
// `requireDescription` bepaalt of changeDescription verplicht is (5-500 tekens):
//   publish/retire → verplicht; new-version → optioneel.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button } from '@/components/ui';

export interface LifecycleSubmit {
  changeDescription?: string;
  approvalReason?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** changeDescription verplicht (publish/retire) of optioneel (new-version). */
  requireDescription: boolean;
  /** Toon ook een (optioneel) goedkeuringsreden-veld. */
  showApprovalReason?: boolean;
  isLoading: boolean;
  onSubmit: (data: LifecycleSubmit) => void;
}

export function LifecycleModal({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  requireDescription,
  showApprovalReason = false,
  isLoading,
  onSubmit,
}: Props) {
  const schema = z.object({
    changeDescription: requireDescription
      ? z.string().min(5, 'Minimaal 5 tekens').max(500, 'Maximaal 500 tekens')
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
      changeDescription: data.changeDescription?.trim() || undefined,
      approvalReason: data.approvalReason?.trim() || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <p className="text-sm text-gray-600">{description}</p>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Omschrijving wijziging {requireDescription && <span className="text-danger-600">*</span>}
          </label>
          <textarea
            {...register('changeDescription')}
            rows={3}
            placeholder="Beschrijf kort wat er wijzigt"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          {errors.changeDescription && (
            <p className="mt-1 text-sm text-danger-600">{errors.changeDescription.message}</p>
          )}
        </div>

        {showApprovalReason && (
          <Input
            label="Goedkeuringsreden (optioneel)"
            placeholder="Optionele toelichting"
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
