import { useState } from 'react';
import { ContactType } from '@/types';
import { Button, Modal, Input, useToast } from '@/components/ui';
import { LocationTypeBadge } from '@/components/location-type-badge';
import { useLocations, useLinkLocationToContactPerson } from '../hooks/use-contacts';
import { getErrorMessage } from '@/lib/api-client';

interface LinkLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  personId: string;
  personContactId: string;
  alreadyLinkedIds: string[];
}

export function LinkLocationModal({
  isOpen,
  onClose,
  personId,
  personContactId,
  alreadyLinkedIds,
}: LinkLocationModalProps) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const linkMutation = useLinkLocationToContactPerson(personId);

  const { data, isLoading } = useLocations({
    search: search || undefined,
    limit: 50,
  });

  const locations = (data?.data ?? []).filter((l) => !alreadyLinkedIds.includes(l.id));

  const getContactName = (contact: { type: string; companyName: string | null; firstName: string | null; lastName: string | null } | undefined) => {
    if (!contact) return '—';
    if (contact.type === ContactType.COMPANY) return contact.companyName || '—';
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
  };

  const handleClose = () => {
    setSearch('');
    setSelectedLocationId(null);
    setNotes('');
    onClose();
  };

  const handleLink = async () => {
    if (!selectedLocationId) return;
    try {
      await linkMutation.mutateAsync({ locationId: selectedLocationId, notes: notes || undefined });
      showToast('Locatie gekoppeld', 'success');
      handleClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Locatie koppelen"
    >
      <div className="space-y-4">
        {/* Search */}
        <Input
          label="Zoeken"
          placeholder="Naam, adres of plaats..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedLocationId(null);
          }}
        />

        {/* Results list */}
        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Laden...</p>
          ) : locations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              {search ? 'Geen locaties gevonden' : 'Typ om te zoeken'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {locations.map((location) => {
                const isExternal = location.contactId !== personContactId;
                const contactName = getContactName(location.contact);
                const isSelected = selectedLocationId === location.id;

                return (
                  <li
                    key={location.id}
                    onClick={() => setSelectedLocationId(location.id)}
                    className={`flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-gray-50 ${
                      isSelected ? 'bg-primary-50 ring-1 ring-inset ring-primary-200' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {location.name}
                        </span>
                        {location.locationType && (
                          <LocationTypeBadge locationType={location.locationType} />
                        )}
                        {isExternal && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Andere relatie
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {location.street} {location.houseNumber}, {location.postalCode} {location.city}
                        {isExternal && contactName !== '—' && ` · ${contactName}`}
                      </p>
                    </div>
                    {isSelected && (
                      <svg className="ml-3 h-4 w-4 shrink-0 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Notes for this link */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Opmerkingen</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optionele toelichting bij deze koppeling..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button
            variant="primary"
            onClick={handleLink}
            disabled={!selectedLocationId}
            isLoading={linkMutation.isPending}
          >
            Koppelen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
