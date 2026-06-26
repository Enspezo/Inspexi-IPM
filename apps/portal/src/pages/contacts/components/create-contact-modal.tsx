import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContactType, CustomFieldEntityType } from '@/types';
import type { Contact } from '@/types';
import { Modal, Input, Button, Checkbox, useToast, KvkSearchInput, Spinner, VatInput } from '@/components/ui';
import { getKvkProfile } from '@/lib/kvk';
import type { KvkSearchResult } from '@/lib/kvk';
import type { VatValidationResult } from '@/lib/vat';
import { apiClient } from '@/lib/api-client';
import { useCreateContact } from '../hooks/use-contacts';
import { CustomFieldsForm } from '@/components/custom-fields';

const contactSchema = z.object({
  type: z.nativeEnum(ContactType),
  companyName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Ongeldig e-mailadres').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  vatNumber: z.string().optional(),
  cocNumber: z.string().optional(),
  isSupplier: z.boolean().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

interface PendingAddress {
  straatnaam: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
}

interface CreateContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the newly created contact after successful creation */
  onCreated?: (contact: Contact) => void;
}

export function CreateContactModal({ isOpen, onClose, onCreated }: CreateContactModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateContact();

  const [pendingAddress, setPendingAddress] = useState<PendingAddress | null>(null);
  const [isKvkFetching, setIsKvkFetching] = useState(false);
  const [vatValidation, setVatValidation] = useState<VatValidationResult | null>(null);
  const [viesNameSuggestion, setViesNameSuggestion] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<ContactFormData & { customFields?: Record<string, any> }>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      type: ContactType.COMPANY,
      customFields: {},
    },
  });

  const contactType = watch('type');

  const handleVatValidationResult = (result: VatValidationResult | null) => {
    setVatValidation(result);
    if (result?.isValid && result.name) {
      const currentName = watch('companyName')?.trim();
      const viesName = result.name.trim();
      if (currentName && viesName && currentName.toLowerCase() !== viesName.toLowerCase()) {
        setViesNameSuggestion(viesName);
      }
    }
  };

  const handleKvkSelect = async (result: KvkSearchResult) => {
    setValue('companyName', result.naam, { shouldDirty: true });
    setValue('cocNumber', result.kvkNummer, { shouldDirty: true });
    setPendingAddress(null);

    // Fetch basisprofiel for complete address and website
    setIsKvkFetching(true);
    try {
      const profile = await getKvkProfile(result.kvkNummer);
      if (profile.website) {
        setValue('website', profile.website, { shouldDirty: true });
      }
      // Prefer bezoekadres, fall back to first address
      const addr =
        profile.adressen.find((a) => a.type === 'bezoekadres') ??
        profile.adressen[0];
      if (addr?.straatnaam) {
        setPendingAddress({
          straatnaam: addr.straatnaam,
          huisnummer: addr.huisnummer,
          postcode: addr.postcode,
          plaats: addr.plaats,
        });
      }
    } catch {
      // Fall back to address in search result if basisprofiel fails
      if (result.straatnaam) {
        setPendingAddress({
          straatnaam: result.straatnaam,
          huisnummer: result.huisnummer,
          postcode: result.postcode,
          plaats: result.plaats,
        });
      }
    } finally {
      setIsKvkFetching(false);
    }
  };

  const onSubmit = async (data: ContactFormData & { customFields?: Record<string, any> }) => {
    try {
      // Remove empty strings (but keep customFields object)
      const { customFields, ...rest } = data;
      const cleaned = {
        ...Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== '' && v !== undefined),
        ),
        customFields,
      };
      const created = await createMutation.mutateAsync({
        ...cleaned,
        // Alleen bedrijven kunnen leverancier zijn
        isSupplier: data.type === ContactType.COMPANY ? data.isSupplier ?? false : false,
        ...(vatValidation ? { vatValidation: vatValidation as any } : {}),
      } as any);

      // Save KvK address if available
      if (pendingAddress?.straatnaam) {
        try {
          await apiClient.post(`/contacts/${created.id}/addresses`, {
            label: 'Vestigingsadres',
            street: pendingAddress.straatnaam,
            houseNumber: pendingAddress.huisnummer ?? '',
            postalCode: pendingAddress.postcode ?? '',
            city: pendingAddress.plaats ?? '',
            country: 'Nederland',
            isPrimary: true,
          });
        } catch {
          // Address creation failure is non-critical — contact is already saved
          showToast('Relatie aangemaakt, maar adres opslaan mislukt', 'info');
        }
      }

      showToast('Relatie aangemaakt!', 'success');
      reset();
      setPendingAddress(null);
      setVatValidation(null);
      setViesNameSuggestion(null);
      onCreated?.(created);
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
    setPendingAddress(null);
    setVatValidation(null);
    setViesNameSuggestion(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Relatie aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Type toggle */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Type
          </label>
          <div className="flex rounded-lg border border-gray-300 p-1">
            <label
              className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                contactType === ContactType.COMPANY
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                value={ContactType.COMPANY}
                {...register('type')}
                className="sr-only"
              />
              Bedrijf
            </label>
            <label
              className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                contactType === ContactType.INDIVIDUAL
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                value={ContactType.INDIVIDUAL}
                {...register('type')}
                className="sr-only"
              />
              Particulier
            </label>
          </div>
        </div>

        {/* Conditional fields */}
        {contactType === ContactType.COMPANY ? (
          <>
            {/* KvK lookup */}
            <div>
              <KvkSearchInput
                label="Zoek op KvK"
                onSelect={handleKvkSelect}
                disabled={isKvkFetching}
              />
              {/* Pending address preview */}
              {isKvkFetching && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <Spinner size="sm" />
                  Gegevens ophalen uit KvK…
                </div>
              )}
              {!isKvkFetching && pendingAddress && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>
                    Adres wordt opgeslagen:{' '}
                    <strong>
                      {[
                        [pendingAddress.straatnaam, pendingAddress.huisnummer]
                          .filter(Boolean)
                          .join(' '),
                        [pendingAddress.postcode, pendingAddress.plaats]
                          .filter(Boolean)
                          .join(' '),
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingAddress(null)}
                    className="ml-auto flex-shrink-0 text-green-600 hover:text-green-800"
                    aria-label="Adres niet opslaan"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <Input
              label="Bedrijfsnaam"
              placeholder="Bouwbedrijf De Vries BV"
              error={errors.companyName?.message}
              {...register('companyName')}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="KvK-nummer"
                placeholder="12345678"
                {...register('cocNumber')}
              />
              <Controller
                name="vatNumber"
                control={control}
                render={({ field }) => (
                  <VatInput
                    label="BTW-nummer"
                    placeholder="NL123456789B01"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onValidationResult={handleVatValidationResult}
                  />
                )}
              />
            </div>

            {/* VIES naam-mismatch melding */}
            {viesNameSuggestion && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
                <p className="font-medium text-amber-800">Naam verschilt van VIES-register</p>
                <p className="mt-1 text-amber-700">
                  VIES geeft de naam <strong>{viesNameSuggestion}</strong> terug. Wil je de bedrijfsnaam bijwerken?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-800"
                    onClick={() => {
                      setValue('companyName', viesNameSuggestion, { shouldDirty: true });
                      setViesNameSuggestion(null);
                    }}
                  >
                    Ja, bijwerken
                  </button>
                  <button
                    type="button"
                    className="rounded px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                    onClick={() => setViesNameSuggestion(null)}
                  >
                    Nee, behouden
                  </button>
                </div>
              </div>
            )}

            <Input
              label="Website"
              placeholder="https://bedrijf.nl"
              {...register('website')}
            />

            <Checkbox
              label="Deze relatie is een leverancier"
              {...register('isSupplier')}
            />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Voornaam"
              placeholder="Jan"
              {...register('firstName')}
            />
            <Input
              label="Achternaam"
              placeholder="de Vries"
              {...register('lastName')}
            />
          </div>
        )}

        {/* Shared fields */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="E-mail"
            type="email"
            placeholder="info@bedrijf.nl"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Telefoon"
            placeholder="+31 20 123 4567"
            {...register('phone')}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Notities
          </label>
          <textarea
            {...register('notes')}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Optionele opmerkingen..."
          />
        </div>

        <CustomFieldsForm
          entityType={CustomFieldEntityType.CONTACT}
          register={register}
          errors={errors}
          control={control}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending || isKvkFetching}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
