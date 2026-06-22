import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { PlanningSearchInput } from '@/components/planning/planning-search-input';
import { ManualNumberField } from '@/components/numbering/manual-number-field';
import { useCreateWorkOrder } from '../hooks/use-work-orders';

const workOrderSchema = z.object({
  workOrderNumber: z.string().optional(),
  internalNotes: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

interface CreateWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workOrderId: string) => void;
}

export function CreateWorkOrderModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateWorkOrderModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateWorkOrder();
  const [selectedPlanningItemId, setSelectedPlanningItemId] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
  });

  const onSubmit = async (data: WorkOrderFormData) => {
    try {
      const result = await createMutation.mutateAsync({
        planningItemId: selectedPlanningItemId || undefined,
        workOrderNumber: data.workOrderNumber?.trim() || undefined,
        internalNotes: data.internalNotes || undefined,
        startTime: data.startTime || undefined,
        endTime: data.endTime || undefined,
      });
      showToast('Werkbon aangemaakt!', 'success');
      reset();
      setSelectedPlanningItemId('');
      onClose();
      if (onSuccess && result) {
        onSuccess(result.id);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Aanmaken mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    setSelectedPlanningItemId('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Werkbon aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <PlanningSearchInput
            label="Planregel"
            value={selectedPlanningItemId}
            onSelect={(id) => setSelectedPlanningItemId(id)}
            placeholder="Zoek op product, relatie..."
          />
          <p className="mt-1 text-xs text-gray-500">
            Optioneel — een werkbon kan ook later aan een planregel gekoppeld worden
          </p>
        </div>

        <ManualNumberField
          model="WORK_ORDER"
          label="Werkbonnummer"
          registration={register('workOrderNumber')}
          error={errors.workOrderNumber?.message}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Interne notities
          </label>
          <textarea
            {...register('internalNotes')}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Optionele notities..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Starttijd"
            type="datetime-local"
            {...register('startTime')}
          />
          <Input
            label="Eindtijd"
            type="datetime-local"
            {...register('endTime')}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button
            type="submit"
            isLoading={createMutation.isPending}
          >
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
