import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TimeActivityType } from '@/types';
import type { TimeEntry } from '@/types';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { TIME_ACTIVITY_LABELS } from '@/lib/status';
import { getErrorMessage } from '@/lib/api-client';
import { useProjects } from '@/pages/projects/hooks/use-projects';
import { useUpdateTimeEntry } from '../hooks/use-time-tracking';

const schema = z
  .object({
    activityType: z.nativeEnum(TimeActivityType),
    projectId: z.string(),
    startedAt: z.string().min(1, 'Starttijd is verplicht'),
    endedAt: z.string().min(1, 'Eindtijd is verplicht'),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => new Date(v.endedAt) > new Date(v.startedAt), {
    message: 'Eindtijd moet na de starttijd liggen',
    path: ['endedAt'],
  })
  .refine((v) => v.activityType === TimeActivityType.OVERIG || v.projectId !== '', {
    message: 'Project is verplicht voor deze activiteit',
    path: ['projectId'],
  });

type FormData = z.infer<typeof schema>;

/** "2026-08-27T06:30:00.000Z" → waarde voor <input type="datetime-local"> (lokale tijd). */
function toLocalInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  entry: TimeEntry;
  isOpen: boolean;
  onClose: () => void;
}

/** Urenregel corrigeren (staf) of toewijzen ("nog toe te wijzen"-reistijd). */
export function EditTimeEntryModal({ entry, isOpen, onClose }: Props) {
  const { showToast } = useToast();
  const updateMutation = useUpdateTimeEntry();
  const { data: projectsData } = useProjects({ limit: 200 });
  const projects = projectsData?.data ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      activityType: entry.activityType,
      projectId: entry.projectId ?? '',
      startedAt: toLocalInput(entry.startedAt),
      endedAt: toLocalInput(entry.endedAt),
      notes: entry.notes ?? '',
    },
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate(
      {
        id: entry.id,
        data: {
          activityType: data.activityType,
          projectId: data.projectId === '' ? null : data.projectId,
          startedAt: new Date(data.startedAt).toISOString(),
          endedAt: new Date(data.endedAt).toISOString(),
          notes: data.notes || null,
        },
      },
      {
        onSuccess: () => {
          showToast('Urenregel bijgewerkt', 'success');
          onClose();
        },
        onError: (err) => {
          showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
        },
      },
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Urenregel corrigeren">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select
          label="Activiteit"
          options={Object.entries(TIME_ACTIVITY_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
          {...register('activityType')}
          error={errors.activityType?.message}
        />
        <Select
          label="Project"
          options={[
            { value: '', label: '— Geen project (alleen bij Overig) —' },
            ...projects.map((p) => ({
              value: p.id,
              label: `${p.projectNumber} — ${p.title}`,
            })),
          ]}
          {...register('projectId')}
          error={errors.projectId?.message}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start"
            type="datetime-local"
            {...register('startedAt')}
            error={errors.startedAt?.message}
          />
          <Input
            label="Eind"
            type="datetime-local"
            {...register('endedAt')}
            error={errors.endedAt?.message}
          />
        </div>
        <Input label="Notitie" {...register('notes')} error={errors.notes?.message} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={!isDirty} isLoading={updateMutation.isPending}>
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
