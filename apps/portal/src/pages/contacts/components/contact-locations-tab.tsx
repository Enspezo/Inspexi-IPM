import { useNavigate } from 'react-router-dom';
import { Button, Card, useConfirm, useToast } from '@/components/ui';
import type { Contact, Location } from '@/types';
import type { useDeleteLocation } from '../hooks/use-contacts';
import { CardMenu } from './card-menu';
import { getErrorMessage } from '@/lib/api-client';

export function ContactLocationsTab({
  contact,
  userCanWrite,
  onAdd,
  onEdit,
  deleteLocationMutation,
}: {
  contact: Contact;
  userCanWrite: boolean;
  onAdd: () => void;
  onEdit: (location: Location) => void;
  deleteLocationMutation: ReturnType<typeof useDeleteLocation>;
}) {
  const navigate = useNavigate();
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
            Locatie toevoegen
          </Button>
        </div>
      )}
      {(contact.locations?.length || 0) === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Nog geen locaties toegevoegd
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contact.locations?.map((loc) => (
            <Card key={loc.id}>
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        onClick={() => navigate(`/contacts/locations/${loc.id}`)}
                        className="text-sm font-medium text-primary-700 hover:underline"
                      >
                        {loc.name}
                      </button>
                      {loc.objectType && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {loc.objectType}
                        </span>
                      )}
                    </div>
                  </div>
                  {userCanWrite && (
                    <CardMenu
                      onEdit={() => onEdit(loc)}
                      onDelete={async () => {
                        const confirmed = await confirm({
                          title: 'Locatie verwijderen',
                          message: 'Weet u zeker dat u deze locatie wilt verwijderen?',
                          confirmLabel: 'Verwijderen',
                        });
                        if (!confirmed) return;
                        try {
                          await deleteLocationMutation.mutateAsync(loc.id);
                          showToast('Locatie verwijderd', 'success');
                        } catch (err) {
                          showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
                        }
                      }}
                    />
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {loc.street} {loc.houseNumber}
                </p>
                <p className="text-sm text-gray-600">
                  {loc.postalCode} {loc.city}
                </p>
                {loc.notes && (
                  <p className="mt-2 text-xs text-gray-400">{loc.notes}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
