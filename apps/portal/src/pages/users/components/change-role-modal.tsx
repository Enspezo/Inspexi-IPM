import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Role, type User } from '@/types';
import { Modal, Checkbox, Button, Badge, useToast } from '@/components/ui';
import { useChangeRole } from '../hooks/use-users';

const changeRolesSchema = z
  .object({
    roles: z.array(z.nativeEnum(Role)).min(1, 'Selecteer minimaal één rol'),
  })
  .refine(
    (data) => !(data.roles.includes(Role.SUPERUSER) && data.roles.length > 1),
    {
      message: 'SUPERUSER kan niet gecombineerd worden met andere rollen',
      path: ['roles'],
    },
  );

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

  const [selectedRoles, setSelectedRoles] = useState<Role[]>(
    user?.roles ?? [Role.INSPECTEUR],
  );
  const [error, setError] = useState<string | null>(null);

  // Reset state when user or modal open state changes
  useEffect(() => {
    if (isOpen && user) {
      setSelectedRoles(user.roles);
      setError(null);
    }
  }, [isOpen, user]);

  const toggleRole = (role: Role, checked: boolean) => {
    setError(null);
    setSelectedRoles((prev) =>
      checked ? [...prev, role] : prev.filter((r) => r !== role),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const result = changeRolesSchema.safeParse({ roles: selectedRoles });
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? 'Ongeldige selectie');
      return;
    }

    try {
      await changeRoleMutation.mutateAsync({
        userId: user.id,
        roles: selectedRoles,
      });
      showToast('Rollen succesvol gewijzigd', 'success');
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Rollen wijzigen">
      {user && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-sm text-gray-600">
              Wijzig de rollen van{' '}
              <span className="font-medium text-gray-900">
                {user.firstName} {user.lastName}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="text-sm text-gray-500">Huidige rollen:</span>
              {user.roles.map((r) => (
                <Badge key={r} role={r} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Nieuwe rollen
            </p>
            <div className="space-y-2">
              {roleOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Checkbox
                    checked={selectedRoles.includes(opt.value)}
                    onChange={(e) => toggleRole(opt.value, e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            )}
          </div>

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
