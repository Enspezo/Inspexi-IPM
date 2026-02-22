import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role } from '@/types';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useInviteUser } from '../hooks/use-users';

const inviteSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mailadres is verplicht')
    .email('Ongeldig e-mailadres'),
  role: z.nativeEnum(Role, {
    errorMap: () => ({ message: 'Selecteer een rol' }),
  }),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const roleOptions = [
  { value: Role.ORG_ADMIN, label: 'Org Admin' },
  { value: Role.MANAGER, label: 'Manager' },
  { value: Role.BACKOFFICE, label: 'Backoffice' },
  { value: Role.WERKVOORBEREIDER, label: 'Werkvoorbereider' },
  { value: Role.INSPECTEUR, label: 'Inspecteur' },
];

export function InviteUserModal({ isOpen, onClose }: InviteUserModalProps) {
  const { showToast } = useToast();
  const inviteMutation = useInviteUser();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: Role.INSPECTEUR,
    },
  });

  const onSubmit = async (data: InviteFormData) => {
    try {
      await inviteMutation.mutateAsync(data);
      showToast('Uitnodiging verstuurd!', 'success');
      reset();
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Uitnodiging versturen mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Gebruiker uitnodigen">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="E-mailadres"
          type="email"
          placeholder="naam@bedrijf.nl"
          error={errors.email?.message}
          {...register('email')}
        />

        <Select
          label="Rol"
          options={roleOptions}
          error={errors.role?.message}
          {...register('role')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={inviteMutation.isPending}>
            Uitnodigen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
