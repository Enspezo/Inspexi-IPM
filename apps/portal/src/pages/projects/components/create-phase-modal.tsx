import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Select, Modal } from '@/components/ui';
import { PhaseStatus } from '@/types';
import { PHASE_STATUS } from '@/lib/status';
import type { SelectOption } from './project-phase-card';
import type { CreatePhaseData } from '../hooks/use-project-phases';

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  status: z.nativeEnum(PhaseStatus),
  description: z.string().optional(),
  locationId: z.string().optional(),
  contactPersonId: z.string().optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  budgetAmount: z.string().optional(),
});

type CreatePhaseForm = z.infer<typeof schema>;

const STATUS_OPTIONS = Object.values(PhaseStatus).map((s) => ({
  value: s,
  label: PHASE_STATUS[s].label,
}));

export function CreatePhaseModal({
  canWrite,
  locationOptions,
  contactPersonOptions,
  onClose,
  onCreate,
  isCreating,
}: {
  canWrite: boolean;
  locationOptions: SelectOption[];
  contactPersonOptions: SelectOption[];
  onClose: () => void;
  onCreate: (data: CreatePhaseData) => Promise<void>;
  isCreating: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreatePhaseForm>({
    resolver: zodResolver(schema),
    defaultValues: { status: PhaseStatus.NIET_GESTART },
  });

  const handleCreate = async (data: CreatePhaseForm) => {
    await onCreate({
      name: data.name,
      status: data.status,
      description: data.description || undefined,
      locationId: data.locationId || undefined,
      contactPersonId: data.contactPersonId || undefined,
      startDate: data.startDate || undefined,
      expectedEndDate: data.expectedEndDate || undefined,
      budgetAmount:
        canWrite && data.budgetAmount ? Number(data.budgetAmount) : undefined,
    });
  };

  return (
    <Modal isOpen onClose={onClose} title="Fase toevoegen">
      <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Naam *</label>
            <Input {...register('name')} placeholder="Bijv. Kantoorpand Zuidas" />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <Select options={STATUS_OPTIONS} {...register('status')} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Beschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Locatie</label>
            <Select
              options={[{ value: '', label: 'Geen' }, ...locationOptions]}
              {...register('locationId')}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Contactpersoon</label>
            <Select
              options={[{ value: '', label: 'Geen' }, ...contactPersonOptions]}
              {...register('contactPersonId')}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Startdatum</label>
            <Input type="date" {...register('startDate')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Verwachte einddatum</label>
            <Input type="date" {...register('expectedEndDate')} />
          </div>
          {canWrite && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Budget (€)</label>
              <Input type="number" step="0.01" min={0} {...register('budgetAmount')} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isCreating}>
            Toevoegen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
