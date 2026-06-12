import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { useCreatePriceTable } from '../hooks/use-price-tables';
import { getErrorMessage } from '@/lib/api-client';

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface CreatePriceTableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePriceTableModal({ isOpen, onClose }: CreatePriceTableModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreatePriceTable();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isDefault: false },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        isDefault: data.isDefault,
      });
      showToast('Prijstabel aangemaakt!', 'success');
      reset();
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Aanmaken mislukt'), 'error');
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Prijstabel aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="Standaard prijstabel"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Beschrijving"
          placeholder="Optionele beschrijving"
          {...register('description')}
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            {...register('isDefault')}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">
            Standaard prijstabel (wordt gebruikt als geen specifieke tabel gekoppeld is)
          </span>
        </label>

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
