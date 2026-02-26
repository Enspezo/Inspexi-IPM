import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import type { User } from '@/types';
import { useAdminUpdateUser } from '../hooks/use-users';

const schema = z.object({
  firstName: z.string().min(1, 'Verplicht'),
  lastName: z.string().min(1, 'Verplicht'),
  email: z.string().email('Ongeldig e-mailadres'),
  initials: z
    .string()
    .max(4, 'Maximaal 4 tekens')
    .regex(/^[A-Z]*$/, 'Alleen hoofdletters (A-Z)')
    .optional()
    .transform((v) => v || undefined),
});

type FormData = z.infer<typeof schema>;

interface EditUserModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export function EditUserModal({ user, isOpen, onClose }: EditUserModalProps) {
  const { showToast } = useToast();
  const updateMutation = useAdminUpdateUser();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        initials: user.initials ?? '',
      });
    }
  }, [isOpen, user, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({ userId: user.id, data });
      showToast('Gebruiker bijgewerkt', 'success');
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Bijwerken mislukt',
        'error',
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${user.firstName} ${user.lastName} bewerken`}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Voornaam"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Achternaam"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <Input
          label="E-mailadres"
          type="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <Input
            label="Initialen"
            placeholder="bv. JDV"
            maxLength={4}
            error={errors.initials?.message}
            {...register('initials', {
              onChange: (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
              },
            })}
          />
          <p className="mt-1 text-xs text-gray-500">
            Max. 4 hoofdletters (A–Z). Wordt gebruikt bij offertes en documentnaamgeving.
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            type="submit"
            isLoading={updateMutation.isPending}
            disabled={!isDirty}
          >
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
