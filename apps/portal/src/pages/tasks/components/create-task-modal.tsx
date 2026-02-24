import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useUsers } from '@/pages/users/hooks/use-users';
import { useCreateTask } from '../hooks/use-tasks';
import { TaskEntityType } from '@/types';

const taskSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  status: z.string().optional(),
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

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: TaskEntityType;
  entityId: string;
}

export function CreateTaskModal({
  isOpen,
  onClose,
  entityType,
  entityId,
}: CreateTaskModalProps) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const createMutation = useCreateTask();
  const { data: users } = useUsers();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      status: 'TE_DOEN',
      assigneeId: '',
    },
  });

  // Build assignee options: "Niet toegewezen" → "Ikzelf" → other users
  const assigneeOptions = [
    { value: '', label: 'Niet toegewezen' },
    ...(user ? [{ value: user.id, label: 'Ikzelf' }] : []),
    ...(users || [])
      .filter((u) => u.id !== user?.id && u.isActive)
      .map((u) => ({
        value: u.id,
        label: `${u.firstName} ${u.lastName}`,
      })),
  ];

  const onSubmit = async (data: TaskFormData) => {
    try {
      await createMutation.mutateAsync({
        title: data.title,
        description: data.description || undefined,
        status: (data.status as any) || undefined,
        entityType,
        entityId,
        assigneeId: data.assigneeId || undefined,
        deadline: data.deadline || undefined,
      });
      showToast('Taak aangemaakt!', 'success');
      reset();
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
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Taak aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          <Button type="submit" isLoading={createMutation.isPending}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
