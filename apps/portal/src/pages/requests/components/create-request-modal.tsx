import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useCreateRequest, useOrgUsers } from '../hooks/use-requests';
import { useContactLocations } from '@/pages/contacts/hooks/use-contacts';
import { ContactSearchInput } from '@/components/contacts/contact-search-input';
import { CustomFieldsForm } from '@/components/custom-fields';
import { RequestSource, Priority, CustomFieldEntityType } from '@/types';

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

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill and lock the contact field when opened from a contact detail page */
  contactId?: string;
}

export function CreateRequestModal({ isOpen, onClose, contactId: prefilledContactId }: CreateRequestModalProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateRequest();
  const { data: usersData } = useOrgUsers();
  const [selectedContactId, setSelectedContactId] = useState(prefilledContactId || '');

  const { data: locationsData } = useContactLocations(selectedContactId);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData & { customFields?: Record<string, any> }>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactId: prefilledContactId || '',
      source: RequestSource.MANUAL,
      priority: Priority.NORMAL,
      customFields: {},
    },
  });

  // Sync prefilled contactId when modal opens
  useEffect(() => {
    if (isOpen && prefilledContactId) {
      setValue('contactId', prefilledContactId);
      setSelectedContactId(prefilledContactId);
    }
  }, [isOpen, prefilledContactId, setValue]);

  const locations = locationsData || [];
  const users = usersData || [];

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

  const handleContactSelect = (contactId: string) => {
    setValue('contactId', contactId, { shouldValidate: true });
    if (contactId !== selectedContactId) {
      setValue('locationId', '');
      setSelectedContactId(contactId);
    }
  };

  const onSubmit = async (data: FormData & { customFields?: Record<string, any> }) => {
    try {
      await createMutation.mutateAsync({
        contactId: data.contactId,
        locationId: data.locationId || undefined,
        assignedTo: data.assignedTo || undefined,
        source: data.source,
        title: data.title,
        description: data.description || undefined,
        priority: data.priority || undefined,
        customFields: data.customFields,
      } as any);
      showToast('Aanvraag aangemaakt!', 'success');
      // Invalidate contact detail so the aanvragen tab updates
      if (prefilledContactId) {
        queryClient.invalidateQueries({ queryKey: ['contacts', prefilledContactId] });
      }
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
        <ContactSearchInput
          label="Relatie"
          value={selectedContactId}
          onSelect={handleContactSelect}
          error={errors.contactId?.message}
          disabled={!!prefilledContactId}
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

        <CustomFieldsForm
          entityType={CustomFieldEntityType.REQUEST}
          register={register}
          errors={errors}
          control={control}
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
