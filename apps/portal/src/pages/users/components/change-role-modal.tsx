import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role, type User } from '@/types';
import { Modal, Select, Button, Badge, useToast } from '@/components/ui';
import { useChangeRole } from '../hooks/use-users';

const changeRoleSchema = z.object({
  role: z.nativeEnum(Role, {
    errorMap: () => ({ message: 'Selecteer een rol' }),
  }),
});

type ChangeRoleFormData = z.infer<typeof changeRoleSchema>;

interface ChangeRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const roleOptions = [
  { value: Role.ORG_ADMIN, label: 'Org Admin' },
  { value: Role.MANAGER, label: 'Manager' },
  { value: Role.BACKOFFICE, label: 'Backoffice' },
  { value: Role.WERKVOORBEREIDER, label: 'Werkvoorbereider' },
  { value: Role.INSPECTEUR, label: 'Inspecteur' },
];

export function ChangeRoleModal({
  isOpen,
  onClose,
  user,
}: ChangeRoleModalProps) {
  const { showToast } = useToast();
  const changeRoleMutation = useChangeRole();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeRoleFormData>({
    resolver: zodResolver(changeRoleSchema),
    values: {
      role: user?.role ?? Role.INSPECTEUR,
    },
  });

  const onSubmit = async (data: ChangeRoleFormData) => {
    if (!user) return;

    try {
      await changeRoleMutation.mutateAsync({
        userId: user.id,
        role: data.role,
      });
      showToast('Rol succesvol gewijzigd', 'success');
      reset();
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Rol wijzigen mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Rol wijzigen">
      {user && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <p className="text-sm text-gray-600">
              Wijzig de rol van{' '}
              <span className="font-medium text-gray-900">
                {user.firstName} {user.lastName}
              </span>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-gray-500">Huidige rol:</span>
              <Badge role={user.role} />
            </div>
          </div>

          <Select
            label="Nieuwe rol"
            options={roleOptions}
            error={errors.role?.message}
            {...register('role')}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Annuleren
            </Button>
            <Button
              type="submit"
              isLoading={changeRoleMutation.isPending}
            >
              Opslaan
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
