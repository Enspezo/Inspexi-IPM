import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { AddressSearchInput } from '@/components/ui/address-search-input';
import { useAddLocation } from '../hooks/use-contacts';
import { useLocationTypes } from '@/pages/location-types/hooks/use-location-types';
import type { ParsedAddress } from '@/lib/geocoding';
import type { Location } from '@/types';

const locationSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  street: z.string().min(1, 'Straat is verplicht'),
  houseNumber: z.string().min(1, 'Huisnummer is verplicht'),
  postalCode: z.string().min(1, 'Postcode is verplicht'),
  city: z.string().min(1, 'Stad is verplicht'),
  locationTypeId: z.string().optional(),
  notes: z.string().optional(),
});

type LocationFormData = z.infer<typeof locationSchema>;

interface AddLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  /** Called with the newly created location after successful creation */
  onCreated?: (location: Location) => void;
}

export function AddLocationModal({
  isOpen,
  onClose,
  contactId,
  onCreated,
}: AddLocationModalProps) {
  const { showToast } = useToast();
  const addMutation = useAddLocation(contactId);
  const { data: locationTypes = [] } = useLocationTypes({ scope: 'CRM' });
  const [pdokData, setPdokData] = useState<Record<string, unknown> | null>(null);

  const locationTypeOptions = [
    { value: '', label: 'Geen type' },
    ...locationTypes.map((t) => ({ value: t.id, label: t.name })),
  ];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
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
        locationTypeId: data.locationTypeId || undefined,
        notes: data.notes || undefined,
        pdokData: pdokData ?? undefined,
      };
      const created = await addMutation.mutateAsync(cleaned);
      showToast('Locatie toegevoegd!', 'success');
      reset();
      setPdokData(null);
      onCreated?.(created);
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
    setPdokData(null);
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

        <AddressSearchInput
          label="Adres zoeken (PDOK)"
          placeholder="Zoek een adres…"
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
          label="Locatietype"
          options={locationTypeOptions}
          {...register('locationTypeId')}
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
