import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast, AddressSearchInput } from '@/components/ui';
import type { User } from '@/types';
import type { ParsedAddress } from '@/lib/geocoding';
import { useAdminUpdateUser } from '../hooks/use-users';

const schema = z.object({
  firstName: z.string().min(1, 'Verplicht'),
  lastName: z.string().min(1, 'Verplicht'),
  email: z.string().email('Ongeldig e-mailadres'),
  initials: z
    .string()
    .max(4, 'Maximaal 4 tekens')
    .regex(/^[A-Z]*$/, 'Alleen hoofdletters (A-Z)')
    .optional()
    .transform((v) => v || undefined),
  homeStreet: z.string().optional().nullable(),
  homeHouseNumber: z.string().optional().nullable(),
  homePostalCode: z.string().max(10).optional().nullable(),
  homeCity: z.string().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

interface EditUserModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export function EditUserModal({ user, isOpen, onClose }: EditUserModalProps) {
  const { showToast } = useToast();
  const updateMutation = useAdminUpdateUser();

  // lat/lng are not part of the form schema (hidden fields)
  const [homeLat, setHomeLat] = useState<number | null>(null);
  const [homeLng, setHomeLng] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        initials: user.initials ?? '',
        homeStreet: user.homeStreet ?? '',
        homeHouseNumber: user.homeHouseNumber ?? '',
        homePostalCode: user.homePostalCode ?? '',
        homeCity: user.homeCity ?? '',
      });
      setHomeLat(user.homeLat ?? null);
      setHomeLng(user.homeLng ?? null);
    }
  }, [isOpen, user, reset]);

  const handleAddressSelect = (address: ParsedAddress) => {
    setValue('homeStreet', address.street, { shouldDirty: true });
    setValue('homeHouseNumber', address.houseNumber, { shouldDirty: true });
    setValue('homePostalCode', address.postalCode, { shouldDirty: true });
    setValue('homeCity', address.city, { shouldDirty: true });
    setHomeLat(address.lat);
    setHomeLng(address.lng);
  };

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        userId: user.id,
        data: {
          ...data,
          homeStreet: data.homeStreet || null,
          homeHouseNumber: data.homeHouseNumber || null,
          homePostalCode: data.homePostalCode || null,
          homeCity: data.homeCity || null,
          homeLat,
          homeLng,
        },
      });
      showToast('Gebruiker bijgewerkt', 'success');
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  // Build the label for the address search input's current value
  const currentStreet = watch('homeStreet');
  const currentHouseNumber = watch('homeHouseNumber');
  const currentPostalCode = watch('homePostalCode');
  const currentCity = watch('homeCity');
  const hasAddress = !!(currentStreet && currentCity);
  const addressLabel = hasAddress
    ? `${currentStreet} ${currentHouseNumber}, ${currentPostalCode} ${currentCity}`
    : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${user.firstName} ${user.lastName} bewerken`}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Voornaam"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Achternaam"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <Input
          label="E-mailadres"
          type="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <Input
            label="Initialen"
            placeholder="bv. JDV"
            maxLength={4}
            error={errors.initials?.message}
            {...register('initials', {
              onChange: (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
              },
            })}
          />
          <p className="mt-1 text-xs text-gray-500">
            Max. 4 hoofdletters (A–Z). Wordt gebruikt bij offertes en documentnaamgeving.
          </p>
        </div>

        {/* Home address section */}
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700">Thuisadres</p>

          <AddressSearchInput
            label="Zoek adres"
            placeholder="Typ een straat, huisnummer of postcode…"
            initialValue={addressLabel}
            onSelect={handleAddressSelect}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                label="Straat"
                placeholder="Hoofdstraat"
                {...register('homeStreet')}
              />
            </div>
            <Input
              label="Huisnummer"
              placeholder="1A"
              {...register('homeHouseNumber')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Postcode"
              placeholder="1234 AB"
              maxLength={10}
              {...register('homePostalCode')}
            />
            <Input
              label="Stad"
              placeholder="Amsterdam"
              {...register('homeCity')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            type="submit"
            isLoading={updateMutation.isPending}
            disabled={!isDirty}
          >
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
