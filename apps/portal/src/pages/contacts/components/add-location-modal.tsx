import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useAddLocation } from '../hooks/use-contacts';

const locationSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  street: z.string().min(1, 'Straat is verplicht'),
  houseNumber: z.string().min(1, 'Huisnummer is verplicht'),
  postalCode: z.string().min(1, 'Postcode is verplicht'),
  city: z.string().min(1, 'Stad is verplicht'),
  objectType: z.string().optional(),
  notes: z.string().optional(),
});

type LocationFormData = z.infer<typeof locationSchema>;

const objectTypeOptions = [
  { value: '', label: 'Selecteer type...' },
  { value: 'woning', label: 'Woning' },
  { value: 'kantoor', label: 'Kantoor' },
  { value: 'industrieel', label: 'Industrieel' },
  { value: 'winkel', label: 'Winkel' },
  { value: 'overig', label: 'Overig' },
];

interface AddLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
}

export function AddLocationModal({
  isOpen,
  onClose,
  contactId,
}: AddLocationModalProps) {
  const { showToast } = useToast();
  const addMutation = useAddLocation(contactId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
  });

  const onSubmit = async (data: LocationFormData) => {
    try {
      const cleaned = {
        ...data,
        objectType: data.objectType || undefined,
        notes: data.notes || undefined,
      };
      await addMutation.mutateAsync(cleaned);
      showToast('Locatie toegevoegd!', 'success');
      reset();
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Toevoegen mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Locatie toevoegen">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="Kantoorpand Zuidas"
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Input
              label="Straat"
              placeholder="Gustav Mahlerlaan"
              error={errors.street?.message}
              {...register('street')}
            />
          </div>
          <Input
            label="Huisnr."
            placeholder="10"
            error={errors.houseNumber?.message}
            {...register('houseNumber')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Postcode"
            placeholder="1082 PP"
            error={errors.postalCode?.message}
            {...register('postalCode')}
          />
          <Input
            label="Stad"
            placeholder="Amsterdam"
            error={errors.city?.message}
            {...register('city')}
          />
        </div>

        <Select
          label="Objecttype"
          options={objectTypeOptions}
          {...register('objectType')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Notities
          </label>
          <textarea
            {...register('notes')}
            rows={2}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Optionele opmerkingen..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={addMutation.isPending}>
            Toevoegen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
