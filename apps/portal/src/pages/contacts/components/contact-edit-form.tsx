import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { ContactType, CustomFieldEntityType } from '@/types';
import type { Contact, User } from '@/types';
import { Button, Card, Checkbox, Input, Spinner, VatInput } from '@/components/ui';
import { type VatValidationResult } from '@/lib/vat';
import { CustomFieldsForm } from '@/components/custom-fields';

export const contactSchema = z.object({
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
  ownerId: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

export type ContactFormData = z.infer<typeof contactSchema>;

export function ContactEditForm({
  contact,
  allUsers,
  register,
  control,
  formErrors,
  isDirty,
  isSaving,
  isKvkLookingUp,
  onKvkLookup,
  onVatValidationResult,
  onSubmit,
  onCancel,
}: {
  contact: Contact;
  allUsers: User[] | undefined;
  register: UseFormRegister<ContactFormData>;
  control: Control<ContactFormData>;
  formErrors: FieldErrors<ContactFormData>;
  isDirty: boolean;
  isSaving: boolean;
  isKvkLookingUp: boolean;
  onKvkLookup: () => void;
  onVatValidationResult: (result: VatValidationResult | null) => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
}) {
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        {contact.type === ContactType.COMPANY && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Bedrijfsnaam" {...register('companyName')} />
              <div>
                <Input label="KvK-nummer" {...register('cocNumber')} />
                <button
                  type="button"
                  onClick={onKvkLookup}
                  disabled={isKvkLookingUp}
                  className="mt-1 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 disabled:opacity-50"
                >
                  {isKvkLookingUp ? (
                    <Spinner size="sm" />
                  ) : (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                  Gegevens ophalen uit KvK
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Controller
                name="vatNumber"
                control={control}
                render={({ field }) => (
                  <VatInput
                    label="BTW-nummer"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onValidationResult={onVatValidationResult}
                  />
                )}
              />
              <Input label="Website" {...register('website')} />
            </div>
            <Checkbox
              label="Deze relatie is een leverancier"
              {...register('isSupplier')}
            />
          </>
        )}
        {contact.type === ContactType.INDIVIDUAL && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Voornaam" {...register('firstName')} />
            <Input label="Achternaam" {...register('lastName')} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="E-mail"
            type="email"
            error={formErrors.email?.message}
            {...register('email')}
          />
          <Input label="Telefoon" {...register('phone')} />
        </div>
        <div className="w-1/2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Eigenaar</label>
          <select
            {...register('ownerId')}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">Geen eigenaar</option>
            {(allUsers || []).filter((u) => u.isActive).map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Notities</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <CustomFieldsForm
          entityType={CustomFieldEntityType.CONTACT}
          register={register}
          errors={formErrors}
          control={control}
        />
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            Annuleren
          </Button>
          <Button
            type="submit"
            isLoading={isSaving}
            disabled={!isDirty}
          >
            Opslaan
          </Button>
        </div>
      </form>
    </Card>
  );
}
