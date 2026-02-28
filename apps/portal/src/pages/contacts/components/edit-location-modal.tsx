import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { AddressSearchInput } from '@/components/ui/address-search-input';
import { useUpdateLocation } from '../hooks/use-contacts';
import type { Location } from '@/types';
import type { ParsedAddress } from '@/lib/geocoding';

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

interface EditLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  location: Location;
}

export function EditLocationModal({
  isOpen,
  onClose,
  contactId,
  location,
}: EditLocationModalProps) {
  const { showToast } = useToast();
  const updateMutation = useUpdateLocation(contactId);
  // Track pdokData separately; initialized from existing location data
  const [pdokData, setPdokData] = useState<Record<string, unknown> | null>(
    location.pdokData ?? null,
  );

  const currentAddressLabel = `${location.street} ${location.houseNumber}, ${location.postalCode} ${location.city}`;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: location.name,
      street: location.street,
      houseNumber: location.houseNumber,
      postalCode: location.postalCode,
      city: location.city,
      objectType: location.objectType || '',
      notes: location.notes || '',
    },
  });

  const handleAddressSelect = (address: ParsedAddress) => {
    setValue('street', address.street, { shouldValidate: true });
    setValue('houseNumber', address.houseNumber, { shouldValidate: true });
    setValue('postalCode', address.postalCode, { shouldValidate: true });
    setValue('city', address.city, { shouldValidate: true });
    setPdokData(address.pdokData);
  };

  const onSubmit = async (data: LocationFormData) => {
    try {
      const cleaned = {
        ...data,
        objectType: data.objectType || undefined,
        notes: data.notes || undefined,
        pdokData: pdokData ?? undefined,
      };
      await updateMutation.mutateAsync({ locationId: location.id, data: cleaned });
      showToast('Locatie bijgewerkt!', 'success');
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Bijwerken mislukt',
        'error',
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Locatie bewerken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="Kantoorpand Zuidas"
          error={errors.name?.message}
          {...register('name')}
        />

        <AddressSearchInput
          label="Adres zoeken (PDOK)"
          placeholder="Zoek een adres…"
          initialValue={currentAddressLabel}
          onSelect={handleAddressSelect}
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
