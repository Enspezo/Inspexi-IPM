import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useUsers } from '@/pages/users/hooks/use-users';
import { useUpdateTask } from '../hooks/use-tasks';
import type { Task, TaskType } from '@/types';

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

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
}

export function EditTaskModal({
  isOpen,
  onClose,
  task,
}: EditTaskModalProps) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const updateMutation = useUpdateTask();
  const { data: users } = useUsers();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task.title,
      status: task.status,
      taskType: task.taskType || 'TO_DO',
      assigneeId: task.assigneeId || '',
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
      description: task.description || '',
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
      await updateMutation.mutateAsync({
        id: task.id,
        data: {
          title: data.title,
          description: data.description || undefined,
          status: (data.status as any) || undefined,
          taskType: (data.taskType as TaskType) || undefined,
          assigneeId: data.assigneeId || null,
          deadline: data.deadline || null,
        },
      });
      showToast('Taak bijgewerkt!', 'success');
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Bijwerken mislukt',
        'error',
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Taak bewerken">
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
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={updateMutation.isPending}>
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
