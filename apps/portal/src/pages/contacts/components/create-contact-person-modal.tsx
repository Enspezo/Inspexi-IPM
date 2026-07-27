import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, QueryErrorNotice, Select, Button, useToast } from '@/components/ui';
import { useContacts, useAddContactPerson, useContactPersonRoles } from '../hooks/use-contacts';

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
  /** Called with the chosen relatie's id after successful creation */
  onCreated?: (contactId: string) => void;
}

export function CreateContactPersonModal({ isOpen, onClose, onCreated }: Props) {
  const { showToast } = useToast();
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactIdError, setContactIdError] = useState('');

  const {
    data: contactsData,
    error: contactsError,
    refetch: refetchContacts,
  } = useContacts({ limit: 200 });
  const contacts = contactsData?.data ?? [];
  const contactOptions = [
    { value: '', label: 'Selecteer een relatie...' },
    ...contacts.map((c) => ({
      value: c.id,
      label:
        c.companyName ||
        [c.firstName, c.lastName].filter(Boolean).join(' ') ||
        c.email ||
        c.id,
    })),
  ];

  const addMutation = useAddContactPerson(selectedContactId);
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

  const handleContactChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedContactId(e.target.value);
    if (e.target.value) setContactIdError('');
  };

  const onSubmit = async (data: FormData) => {
    if (!selectedContactId) {
      setContactIdError('Selecteer een relatie');
      return;
    }
    try {
      await addMutation.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        roleId: data.roleId || undefined,
        email: data.email || undefined,
        phone: data.phone || undefined,
        notes: data.notes || undefined,
      });
      showToast('Contactpersoon aangemaakt!', 'success');
      const createdForContactId = selectedContactId;
      reset();
      setSelectedContactId('');
      setContactIdError('');
      onCreated?.(createdForContactId);
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleClose = () => {
    reset();
    setSelectedContactId('');
    setContactIdError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Contactpersoon aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          label="Relatie"
          options={contactOptions}
          value={selectedContactId}
          onChange={handleContactChange}
          error={contactIdError}
        />
        <QueryErrorNotice error={contactsError} label="Relaties" onRetry={refetchContacts} />

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
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
