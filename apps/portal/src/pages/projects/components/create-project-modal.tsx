import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, Button, Input, Select, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useCreateProject } from '../hooks/use-projects';
import { useContactLocations } from '@/pages/contacts/hooks/use-contacts';
import { useUsers } from '@/pages/users/hooks/use-users';
import { ContactSearchInput } from '@/components/contacts/contact-search-input';
import type { Project } from '@/types';
import { getErrorMessage } from '@/lib/api-client';

const schema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  contactId: z.string().min(1, 'Relatie is verplicht'),
  locationId: z.string().optional(),
  projectManagerId: z.string().optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
  defaultContactId?: string;
  defaultRequestId?: string;
}

export function CreateProjectModal({
  onClose,
  onCreated,
  defaultContactId,
  defaultRequestId,
}: Props) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const createMutation = useCreateProject();

  const { data: usersData } = useUsers();
  const [selectedContactId, setSelectedContactId] = useState(defaultContactId || '');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactId: defaultContactId || '',
      projectManagerId: user?.id || '',
      startDate: new Date().toISOString().split('T')[0],
    },
  });

  const { data: locationsData } = useContactLocations(selectedContactId);

  const projectManagerOptions = [
    { value: '', label: 'Selecteer projectmanager...' },
    ...(user
      ? [{ value: user.id, label: `Ikzelf (${user.firstName} ${user.lastName})` }]
      : []),
    ...(usersData ?? [])
      .filter((u) => u.id !== user?.id)
      .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
  ];

  const locations = (locationsData ?? []).map((l) => ({
    value: l.id,
    label: l.name || `${l.street} ${l.houseNumber}, ${l.city}`,
  }));

  const handleContactSelect = (contactId: string) => {
    setValue('contactId', contactId, { shouldValidate: true });
    if (contactId !== selectedContactId) {
      setValue('locationId', '');
      setSelectedContactId(contactId);
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      const result = await createMutation.mutateAsync({
        ...data,
        requestId: defaultRequestId,
      });
      showToast('Project aangemaakt', 'success');
      reset();
      onCreated(result);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} title="Nieuw project">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Titel *
          </label>
          <Input {...register('title')} placeholder="Projecttitel" />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Beschrijving
          </label>
          <textarea
            {...register('description')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            rows={3}
            placeholder="Optionele beschrijving"
          />
        </div>

        <ContactSearchInput
          label="Relatie *"
          value={selectedContactId}
          onSelect={handleContactSelect}
          error={errors.contactId?.message}
          disabled={!!defaultContactId}
        />

        {locations.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Locatie
            </label>
            <Select
              options={[
                { value: '', label: 'Selecteer locatie...' },
                ...locations,
              ]}
              {...register('locationId')}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Projectmanager
          </label>
          <Select
            options={projectManagerOptions}
            value={watch('projectManagerId')}
            {...register('projectManagerId')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Startdatum
            </label>
            <Input type="date" {...register('startDate')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Verwachte einddatum
            </label>
            <Input type="date" {...register('expectedEndDate')} />
          </div>
        </div>

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
