import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useCreateRequest, useOrgUsers } from '../hooks/use-requests';
import { useContacts } from '@/pages/contacts/hooks/use-contacts';
import { useContactLocations } from '@/pages/contacts/hooks/use-contacts';
import { RequestSource, Priority, ContactType } from '@/types';
import type { Contact } from '@/types';

const sourceOptions = [
  { value: RequestSource.MANUAL, label: 'Handmatig' },
  { value: RequestSource.PHONE, label: 'Telefoon' },
  { value: RequestSource.EMAIL, label: 'E-mail' },
  { value: RequestSource.WEB_FORM, label: 'Webformulier' },
];

const priorityOptions = [
  { value: Priority.LOW, label: 'Laag' },
  { value: Priority.NORMAL, label: 'Normaal' },
  { value: Priority.HIGH, label: 'Hoog' },
];

const schema = z.object({
  contactId: z.string().min(1, 'Relatie is verplicht'),
  locationId: z.string().optional(),
  assignedTo: z.string().optional(),
  source: z.nativeEnum(RequestSource),
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
});

type FormData = z.infer<typeof schema>;

function getContactName(c: Contact): string {
  if (c.type === ContactType.COMPANY) return c.companyName || '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateRequestModal({ isOpen, onClose }: CreateRequestModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateRequest();
  const { data: contactsData } = useContacts({ limit: 100 });
  const { data: usersData } = useOrgUsers();
  const [selectedContactId, setSelectedContactId] = useState('');

  const { data: locationsData } = useContactLocations(selectedContactId);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      source: RequestSource.MANUAL,
      priority: Priority.NORMAL,
    },
  });

  const contactId = watch('contactId');

  useEffect(() => {
    setSelectedContactId(contactId || '');
    // Clear location when contact changes
    if (contactId !== selectedContactId) {
      setValue('locationId', '');
    }
  }, [contactId, selectedContactId, setValue]);

  const contacts = contactsData?.data || [];
  const locations = locationsData || [];
  const users = usersData || [];

  const contactOptions = [
    { value: '', label: 'Selecteer relatie...' },
    ...contacts.map((c) => ({
      value: c.id,
      label: getContactName(c),
    })),
  ];

  const locationOptions = [
    { value: '', label: 'Geen locatie' },
    ...locations.map((l) => ({
      value: l.id,
      label: `${l.name} — ${l.city}`,
    })),
  ];

  const userOptions = [
    { value: '', label: 'Niet toegewezen' },
    ...(Array.isArray(users)
      ? users.map((u) => ({
          value: u.id,
          label: `${u.firstName} ${u.lastName}`,
        }))
      : []),
  ];

  const onSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync({
        contactId: data.contactId,
        locationId: data.locationId || undefined,
        assignedTo: data.assignedTo || undefined,
        source: data.source,
        title: data.title,
        description: data.description || undefined,
        priority: data.priority || undefined,
      });
      showToast('Aanvraag aangemaakt!', 'success');
      reset();
      setSelectedContactId('');
      onClose();
    } catch {
      showToast('Aanmaken mislukt', 'error');
    }
  };

  const handleClose = () => {
    reset();
    setSelectedContactId('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Aanvraag aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          label="Relatie"
          options={contactOptions}
          error={errors.contactId?.message}
          {...register('contactId')}
        />

        {selectedContactId && locations.length > 0 && (
          <Select
            label="Locatie"
            options={locationOptions}
            {...register('locationId')}
          />
        )}

        <Input
          label="Titel"
          placeholder="Omschrijving van de aanvraag"
          error={errors.title?.message}
          {...register('title')}
        />

        <Input
          label="Beschrijving"
          placeholder="Optionele toelichting"
          {...register('description')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Bron"
            options={sourceOptions}
            error={errors.source?.message}
            {...register('source')}
          />
          <Select
            label="Prioriteit"
            options={priorityOptions}
            {...register('priority')}
          />
        </div>

        <Select
          label="Toewijzen aan"
          options={userOptions}
          {...register('assignedTo')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
