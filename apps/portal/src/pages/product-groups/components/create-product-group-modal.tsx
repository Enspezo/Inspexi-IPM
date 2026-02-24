import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { useCreateProductGroup } from '../hooks/use-product-groups';

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht').max(100),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProductGroupModal({ isOpen, onClose }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateProductGroup();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync({
        name: data.name,
        notes: data.notes || undefined,
      });
      showToast('Productgroep aangemaakt!', 'success');
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Productgroep aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="Bijv. Inspectie"
          error={errors.name?.message}
          {...register('name')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Notities
          </label>
          <textarea
            {...register('notes')}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Optionele notities..."
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
