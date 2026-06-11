import { Button, Card, useConfirm, useToast } from '@/components/ui';
import type { Contact, ContactAddress } from '@/types';
import type { useDeleteAddress } from '../hooks/use-contacts';
import { CardMenu } from './card-menu';

export function ContactAddressesTab({
  contact,
  userCanWrite,
  onAdd,
  onEdit,
  deleteAddressMutation,
}: {
  contact: Contact;
  userCanWrite: boolean;
  onAdd: () => void;
  onEdit: (address: ContactAddress) => void;
  deleteAddressMutation: ReturnType<typeof useDeleteAddress>;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  return (
    <div className="space-y-4">
      {userCanWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onAdd}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adres toevoegen
          </Button>
        </div>
      )}
      {(contact.addresses?.length || 0) === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Nog geen adressen toegevoegd
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contact.addresses?.map((addr) => (
            <Card key={addr.id}>
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-sm font-medium text-gray-900">
                        {addr.label}
                      </span>
                      {addr.isPrimary && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Primair
                        </span>
                      )}
                      {addr.isPostal && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                          Postadres
                        </span>
                      )}
                      {addr.isInvoice && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Factuuradres
                        </span>
                      )}
                    </div>
                  </div>
                  {userCanWrite && (
                    <CardMenu
                      onEdit={() => onEdit(addr)}
                      onDelete={async () => {
                        const confirmed = await confirm({
                          title: 'Adres verwijderen',
                          message: 'Weet u zeker dat u dit adres wilt verwijderen?',
                          confirmLabel: 'Verwijderen',
                        });
                        if (!confirmed) return;
                        try {
                          await deleteAddressMutation.mutateAsync(addr.id);
                          showToast('Adres verwijderd', 'success');
                        } catch {
                          showToast('Verwijderen mislukt', 'error');
                        }
                      }}
                    />
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {addr.street} {addr.houseNumber}
                </p>
                <p className="text-sm text-gray-600">
                  {addr.postalCode} {addr.city}
                </p>
                <p className="text-sm text-gray-400">{addr.country}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
