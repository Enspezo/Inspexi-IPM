import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role } from '@/types';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useInviteOrganizationUser } from '../hooks/use-organizations';

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

interface InviteOrgUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
}

const roleOptions = [
  { value: Role.ORG_ADMIN, label: 'Org Admin' },
  { value: Role.MANAGER, label: 'Manager' },
  { value: Role.BACKOFFICE, label: 'Backoffice' },
  { value: Role.WERKVOORBEREIDER, label: 'Werkvoorbereider' },
  { value: Role.INSPECTEUR, label: 'Inspecteur' },
];

/**
 * SUPERUSER-onboarding (WP-B3, B-504): nodig de eerste beheerder van een
 * verse organisatie uit vanaf de org-detailpagina op het superuser-domein.
 * Default-rol is ORG_ADMIN — het gouden pad is "eerste beheerder".
 */
export function InviteOrgUserModal({
  isOpen,
  onClose,
  orgId,
  orgName,
}: InviteOrgUserModalProps) {
  const { showToast } = useToast();
  const inviteMutation = useInviteOrganizationUser(orgId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: Role.ORG_ADMIN,
    },
  });

  const onSubmit = async (data: InviteFormData) => {
    try {
      await inviteMutation.mutateAsync(data);
      showToast('Uitnodiging verstuurd!', 'success');
      reset();
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Gebruiker uitnodigen voor ${orgName}`}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="E-mailadres"
          type="email"
          placeholder="beheerder@bedrijf.nl"
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
