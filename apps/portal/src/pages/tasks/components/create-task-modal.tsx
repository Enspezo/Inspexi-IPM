import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useUsers } from '@/pages/users/hooks/use-users';
import { useContacts } from '@/pages/contacts/hooks/use-contacts';
import { useRequests } from '@/pages/requests/hooks/use-requests';
import { useQuotes } from '@/pages/quotes/hooks/use-quotes';
import { useCreateTask } from '../hooks/use-tasks';
import { TaskEntityType, TaskType, ContactType } from '@/types';
import type { Contact } from '@/types';

const taskSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  status: z.string().optional(),
  taskType: z.string().optional(),
  assigneeId: z.string().optional(),
  deadline: z.string().optional(),
  description: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

const statusOptions = [
  { value: 'TE_DOEN', label: 'Te doen' },
  { value: 'MEE_BEZIG', label: 'Mee bezig' },
  { value: 'VOLTOOID', label: 'Voltooid' },
];

const taskTypeOptions = [
  { value: 'TO_DO', label: 'To-do' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'TELEFOONGESPREK', label: 'Telefoongesprek' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'GOEDKEURING', label: 'Goedkeuring' },
];

const entityTypeOptions = [
  { value: '', label: 'Selecteer type...' },
  { value: TaskEntityType.CONTACT, label: 'Relatie' },
  { value: TaskEntityType.REQUEST, label: 'Aanvraag' },
  { value: TaskEntityType.QUOTE, label: 'Offerte' },
  { value: TaskEntityType.USER, label: 'Gebruiker' },
];

function getContactDisplayName(contact: Contact): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType?: TaskEntityType;
  entityId?: string;
}

export function CreateTaskModal({
  isOpen,
  onClose,
  entityType: fixedEntityType,
  entityId: fixedEntityId,
}: CreateTaskModalProps) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const createMutation = useCreateTask();
  const { data: users } = useUsers();

  const isStandalone = !fixedEntityType || !fixedEntityId;
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');

  // Fetch entity lists for standalone mode
  const { data: contactsData } = useContacts({ limit: 200 });
  const { data: requestsData } = useRequests({ limit: 200 });
  const { data: quotesData } = useQuotes({ limit: 200 });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      status: 'TE_DOEN',
      taskType: 'TO_DO',
      assigneeId: '',
    },
  });

  // Build assignee options: "Niet toegewezen" -> "Ikzelf (Naam)" -> other users
  const assigneeOptions = [
    { value: '', label: 'Niet toegewezen' },
    ...(user ? [{ value: user.id, label: `Ikzelf (${user.firstName} ${user.lastName})` }] : []),
    ...(users || [])
      .filter((u) => u.id !== user?.id && u.isActive)
      .map((u) => ({
        value: u.id,
        label: `${u.firstName} ${u.lastName}`,
      })),
  ];

  // Build entity options based on selected type
  const entityOptions = (() => {
    if (!isStandalone) return [];
    const opts = [{ value: '', label: 'Selecteer...' }];
    if (selectedEntityType === TaskEntityType.CONTACT) {
      (contactsData?.data || []).forEach((c) =>
        opts.push({ value: c.id, label: getContactDisplayName(c) }),
      );
    } else if (selectedEntityType === TaskEntityType.REQUEST) {
      (requestsData?.data || []).forEach((r) =>
        opts.push({ value: r.id, label: r.title }),
      );
    } else if (selectedEntityType === TaskEntityType.QUOTE) {
      (quotesData?.data || []).forEach((q) =>
        opts.push({ value: q.id, label: q.quoteNumber }),
      );
    } else if (selectedEntityType === TaskEntityType.USER) {
      (users || [])
        .filter((u) => u.isActive)
        .forEach((u) =>
          opts.push({ value: u.id, label: `${u.firstName} ${u.lastName}` }),
        );
    }
    return opts;
  })();

  const entityType = fixedEntityType || (selectedEntityType as TaskEntityType);
  const entityId = fixedEntityId || selectedEntityId;

  const onSubmit = async (data: TaskFormData) => {
    if (!entityType || !entityId) {
      showToast('Selecteer een entiteit om de taak aan te koppelen', 'error');
      return;
    }
    try {
      await createMutation.mutateAsync({
        title: data.title,
        description: data.description || undefined,
        status: (data.status as any) || undefined,
        taskType: (data.taskType as TaskType) || undefined,
        entityType,
        entityId,
        assigneeId: data.assigneeId || undefined,
        deadline: data.deadline || undefined,
      });
      showToast('Taak aangemaakt!', 'success');
      reset();
      if (isStandalone) {
        setSelectedEntityType('');
        setSelectedEntityId('');
      }
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Aanmaken mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    if (isStandalone) {
      setSelectedEntityType('');
      setSelectedEntityId('');
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Taak aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {isStandalone && (
          <>
            <Select
              label="Koppelen aan"
              options={entityTypeOptions}
              value={selectedEntityType}
              onChange={(e) => {
                setSelectedEntityType(e.target.value);
                setSelectedEntityId('');
              }}
            />
            {selectedEntityType && (
              <Select
                label={
                  selectedEntityType === TaskEntityType.CONTACT
                    ? 'Relatie'
                    : selectedEntityType === TaskEntityType.REQUEST
                      ? 'Aanvraag'
                      : selectedEntityType === TaskEntityType.USER
                        ? 'Gebruiker'
                        : 'Offerte'
                }
                options={entityOptions}
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
              />
            )}
          </>
        )}

        <Input
          label="Titel"
          placeholder="Bijv. NEN1010 keuring plannen"
          error={errors.title?.message}
          {...register('title')}
        />

        <Select
          label="Status"
          options={statusOptions}
          {...register('status')}
        />

        <Select
          label="Type"
          options={taskTypeOptions}
          {...register('taskType')}
        />

        <Select
          label="Toewijzen aan"
          options={assigneeOptions}
          {...register('assigneeId')}
        />

        <Input
          label="Deadline"
          type="date"
          {...register('deadline')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Omschrijving
          </label>
          <textarea
            {...register('description')}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Optionele omschrijving..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button
            type="submit"
            isLoading={createMutation.isPending}
            disabled={isStandalone && (!entityType || !entityId)}
          >
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
