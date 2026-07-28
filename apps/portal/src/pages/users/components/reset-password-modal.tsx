import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User } from '@/types';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { useAdminResetPassword } from '../hooks/use-users';

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Wachtwoord moet minimaal 8 tekens bevatten'),
    confirmPassword: z.string().min(1, 'Bevestig het wachtwoord'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export function ResetPasswordModal({
  isOpen,
  onClose,
  user,
}: ResetPasswordModalProps) {
  const { showToast } = useToast();
  const resetMutation = useAdminResetPassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: FormData) => {
    if (!user) return;
    try {
      await resetMutation.mutateAsync({
        userId: user.id,
        newPassword: data.newPassword,
      });
      showToast(
        `Wachtwoord van ${user.firstName} ${user.lastName} is gereset`,
        'success',
      );
      handleClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  if (!user) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Wachtwoord resetten"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p>
            U staat op het punt het wachtwoord te resetten van{' '}
            <strong>
              {user.firstName} {user.lastName}
            </strong>{' '}
            ({user.email}). De gebruiker wordt direct uitgelogd uit alle
            actieve sessies.
          </p>
        </div>

        <Input
          label="Nieuw wachtwoord"
          type="password"
          placeholder="Minimaal 8 tekens"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />

        <Input
          label="Wachtwoord bevestigen"
          type="password"
          placeholder="Herhaal het wachtwoord"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={resetMutation.isPending}
          >
            Wachtwoord resetten
          </Button>
        </div>
      </form>
    </Modal>
  );
}
