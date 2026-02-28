import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogType } from '@/types';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useAddLog } from '../hooks/use-contacts';

const logSchema = z.object({
  type: z.nativeEnum(LogType, {
    errorMap: () => ({ message: 'Selecteer een type' }),
  }),
  subject: z.string().optional(),
  body: z.string().optional(),
  loggedAt: z.string().optional(),
});

type LogFormData = z.infer<typeof logSchema>;

const logTypeOptions = [
  { value: LogType.PHONE, label: 'Telefoongesprek' },
  { value: LogType.MEETING, label: 'Vergadering' },
  { value: LogType.NOTE, label: 'Notitie' },
];

interface AddLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  initialType?: LogType;
  initialLoggedAt?: string;
}

export function AddLogModal({ isOpen, onClose, contactId, initialType, initialLoggedAt }: AddLogModalProps) {
  const { showToast } = useToast();
  const addMutation = useAddLog(contactId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LogFormData>({
    resolver: zodResolver(logSchema),
    defaultValues: {
      type: LogType.PHONE,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        type: initialType ?? LogType.PHONE,
        loggedAt: initialLoggedAt ?? '',
      });
    }
  }, [isOpen, initialType, initialLoggedAt, reset]);

  const onSubmit = async (data: LogFormData) => {
    try {
      const cleaned = {
        ...data,
        subject: data.subject || undefined,
        body: data.body || undefined,
        loggedAt: data.loggedAt || undefined,
      };
      await addMutation.mutateAsync(cleaned);
      showToast('Contactmoment gelogd!', 'success');
      reset();
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Loggen mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Contactmoment loggen">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          label="Type"
          options={logTypeOptions}
          error={errors.type?.message}
          {...register('type')}
        />

        <Input
          label="Onderwerp"
          placeholder="Offerte besproken"
          {...register('subject')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Notities
          </label>
          <textarea
            {...register('body')}
            rows={4}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Beschrijf het contactmoment..."
          />
        </div>

        <Input
          label="Datum/tijd"
          type="datetime-local"
          {...register('loggedAt')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={addMutation.isPending}>
            Loggen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
