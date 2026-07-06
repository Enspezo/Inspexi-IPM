import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useAddContactPerson, useContactPersonRoles } from '../hooks/use-contacts';

const schema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht'),
  lastName: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email('Ongeldig e-mailadres').or(z.literal('')).optional(),
  phone: z.string().optional(),
  roleId: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
}

export function AddContactPersonModal({ isOpen, onClose, contactId }: Props) {
  const { showToast } = useToast();
  const addMutation = useAddContactPerson(contactId);
  const { data: roles } = useContactPersonRoles();
  const roleOptions = (roles ?? []).map((r) => ({ value: r.id, label: r.label }));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const cleaned = {
        ...data,
        email: data.email || undefined,
        phone: data.phone || undefined,
        notes: data.notes || undefined,
      };
      await addMutation.mutateAsync(cleaned);
      showToast('Contactpersoon toegevoegd!', 'success');
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Contactpersoon toevoegen">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Voornaam"
            placeholder="Jan"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Achternaam"
            placeholder="de Vries"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="E-mail"
            type="email"
            placeholder="jan@voorbeeld.nl"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Telefoon"
            placeholder="+31 6 12345678"
            {...register('phone')}
          />
        </div>

        <Select
          label="Rol"
          options={roleOptions}
          error={errors.roleId?.message}
          {...register('roleId')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Notities
          </label>
          <textarea
            {...register('notes')}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Optionele notities..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={addMutation.isPending}>
            Toevoegen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
