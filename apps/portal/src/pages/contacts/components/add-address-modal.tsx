import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { useAddAddress } from '../hooks/use-contacts';

const addressSchema = z.object({
  label: z.string().min(1, 'Label is verplicht'),
  street: z.string().min(1, 'Straat is verplicht'),
  houseNumber: z.string().min(1, 'Huisnummer is verplicht'),
  postalCode: z.string().min(1, 'Postcode is verplicht'),
  city: z.string().min(1, 'Stad is verplicht'),
  country: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

type AddressFormData = z.infer<typeof addressSchema>;

interface AddAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
}

export function AddAddressModal({
  isOpen,
  onClose,
  contactId,
}: AddAddressModalProps) {
  const { showToast } = useToast();
  const addMutation = useAddAddress(contactId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      country: 'NL',
      isPrimary: false,
    },
  });

  const onSubmit = async (data: AddressFormData) => {
    try {
      await addMutation.mutateAsync(data);
      showToast('Adres toegevoegd!', 'success');
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Adres toevoegen">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Label"
          placeholder="Hoofdkantoor, Factuuradres, etc."
          error={errors.label?.message}
          {...register('label')}
        />

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Input
              label="Straat"
              placeholder="Industrieweg"
              error={errors.street?.message}
              {...register('street')}
            />
          </div>
          <Input
            label="Huisnr."
            placeholder="42"
            error={errors.houseNumber?.message}
            {...register('houseNumber')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Postcode"
            placeholder="1234 AB"
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

        <Input
          label="Land"
          placeholder="NL"
          {...register('country')}
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            {...register('isPrimary')}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Primair adres</span>
        </label>

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
