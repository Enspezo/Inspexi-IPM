import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Contact } from '@/types';
import { Button, Card, Checkbox, InfoField, Input, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useUpdateContact } from '../hooks/use-contacts';

const inkoopSchema = z.object({
  supplierCustomerNumber: z.string().optional(),
  purchaseConditions: z.string().optional(),
  supplierRating: z.boolean().optional(),
});

type InkoopFormData = z.infer<typeof inkoopSchema>;

export function ContactInkoopTab({
  contact,
  userCanWrite,
}: {
  contact: Contact;
  userCanWrite: boolean;
}) {
  const { showToast } = useToast();
  const updateMutation = useUpdateContact(contact.id);
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<InkoopFormData>({ resolver: zodResolver(inkoopSchema) });

  const defaults = (): InkoopFormData => ({
    supplierCustomerNumber: contact.supplierCustomerNumber || '',
    purchaseConditions: contact.purchaseConditions || '',
    supplierRating: contact.supplierRating ?? false,
  });

  useEffect(() => {
    reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, reset]);

  const onSubmit = async (data: InkoopFormData) => {
    try {
      await updateMutation.mutateAsync({
        supplierCustomerNumber: data.supplierCustomerNumber || undefined,
        purchaseConditions: data.purchaseConditions || undefined,
        supplierRating: data.supplierRating,
      });
      showToast('Inkoopgegevens bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleCancel = () => {
    reset(defaults());
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Klantnummer" {...register('supplierCustomerNumber')} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Inkoopvoorwaarden
            </label>
            <textarea
              {...register('purchaseConditions')}
              rows={4}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <Checkbox label="Leveranciersbeoordeling" {...register('supplierRating')} />
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={updateMutation.isPending}
            >
              Annuleren
            </Button>
            <Button type="submit" isLoading={updateMutation.isPending} disabled={!isDirty}>
              Opslaan
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Inkoopgegevens</h3>
        {userCanWrite && (
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            Bewerken
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <InfoField label="Klantnummer" value={contact.supplierCustomerNumber} />
        <InfoField
          label="Leveranciersbeoordeling"
          value={contact.supplierRating ? 'Ja' : 'Nee'}
        />
        <div className="col-span-2">
          <InfoField label="Inkoopvoorwaarden" value={contact.purchaseConditions} />
        </div>
      </div>
    </Card>
  );
}
