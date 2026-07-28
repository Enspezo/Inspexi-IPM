import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Select, Modal } from '@/components/ui';
import { useUsers } from '@/pages/users/hooks/use-users';
import type { PhaseMilestone } from '@/types';

/** Genormaliseerde milestone-invoer (create + update delen deze velden). */
export interface MilestoneModalData {
  title: string;
  description?: string;
  dueDate: string;
  assigneeId?: string | null;
  reminderDaysBefore?: number;
}

// ─── Schema ────────────────────────────────────────────────

const schema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  dueDate: z.string().min(1, 'Streefdatum is verplicht'),
  assigneeId: z.string().optional(),
  reminderDaysBefore: z.coerce.number().int().min(0).max(365),
});

type MilestoneForm = z.infer<typeof schema>;

// ─── Modal ─────────────────────────────────────────────────

export function PhaseMilestoneModal({
  milestone,
  onClose,
  onSubmit,
  isSaving,
}: {
  /** Aanwezig ⇒ bewerken; afwezig ⇒ nieuw aanmaken. */
  milestone?: PhaseMilestone;
  onClose: () => void;
  onSubmit: (data: MilestoneModalData) => Promise<void>;
  isSaving: boolean;
}) {
  const { data: allUsers } = useUsers();
  const users = useMemo(
    () =>
      (allUsers ?? []).map((u) => ({
        value: u.id,
        label: `${u.firstName} ${u.lastName}`,
      })),
    [allUsers],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MilestoneForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: milestone?.title ?? '',
      description: milestone?.description ?? '',
      dueDate: milestone?.dueDate?.split('T')[0] ?? '',
      assigneeId: milestone?.assigneeId ?? '',
      reminderDaysBefore: milestone?.reminderDaysBefore ?? 7,
    },
  });

  const handleSave = async (data: MilestoneForm) => {
    await onSubmit({
      title: data.title,
      description: data.description || undefined,
      dueDate: data.dueDate,
      assigneeId: data.assigneeId || null,
      reminderDaysBefore: data.reminderDaysBefore,
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={milestone ? 'Milestone bewerken' : 'Milestone toevoegen'}
    >
      <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Titel *
          </label>
          <Input {...register('title')} placeholder="Bijv. Rapportage gereed" />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Omschrijving
          </label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Streefdatum *
            </label>
            <Input type="date" {...register('dueDate')} />
            {errors.dueDate && (
              <p className="mt-1 text-sm text-red-600">{errors.dueDate.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Herinnering (dagen vooraf)
            </label>
            <Input type="number" min={0} {...register('reminderDaysBefore')} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Verantwoordelijke
          </label>
          <Select
            options={[{ value: '', label: 'Geen' }, ...users]}
            {...register('assigneeId')}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {milestone ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
