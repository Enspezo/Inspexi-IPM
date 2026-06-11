import { useState } from 'react';
import { ContactType } from '@/types';
import { Button, Modal, Input, useToast } from '@/components/ui';
import { useContactPersons, useLinkContactPerson } from '../hooks/use-contacts';
import { roleColors } from '@/lib/contact-person-role';

interface LinkContactPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationId: string;
  locationContactId: string;
  alreadyLinkedIds: string[];
}

export function LinkContactPersonModal({
  isOpen,
  onClose,
  locationId,
  locationContactId,
  alreadyLinkedIds,
}: LinkContactPersonModalProps) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const linkMutation = useLinkContactPerson(locationId);

  const { data, isLoading } = useContactPersons({
    search: search || undefined,
    limit: 50,
  });

  const persons = (data?.data ?? []).filter((p) => !alreadyLinkedIds.includes(p.id));

  const selectedPerson = persons.find((p) => p.id === selectedPersonId);

  const getContactName = (contact: { type: string; companyName: string | null; firstName: string | null; lastName: string | null } | undefined) => {
    if (!contact) return '—';
    if (contact.type === ContactType.COMPANY) return contact.companyName || '—';
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
  };

  const handleClose = () => {
    setSearch('');
    setSelectedPersonId(null);
    setNotes('');
    onClose();
  };

  const handleLink = async () => {
    if (!selectedPersonId) return;
    try {
      await linkMutation.mutateAsync({ contactPersonId: selectedPersonId, notes: notes || undefined });
      showToast('Contactpersoon gekoppeld', 'success');
      handleClose();
    } catch {
      showToast('Koppelen mislukt', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Contactpersoon koppelen"
    >
      <div className="space-y-4">
        {/* Search */}
        <Input
          label="Zoeken"
          placeholder="Naam of e-mailadres..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedPersonId(null);
          }}
        />

        {/* Results list */}
        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Laden...</p>
          ) : persons.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              {search ? 'Geen contactpersonen gevonden' : 'Typ om te zoeken'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {persons.map((person) => {
                const isExternal = person.contactId !== locationContactId;
                const contactName = getContactName(person.contact as any);
                const isSelected = selectedPersonId === person.id;

                return (
                  <li
                    key={person.id}
                    onClick={() => setSelectedPersonId(person.id)}
                    className={`flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-gray-50 ${
                      isSelected ? 'bg-primary-50 ring-1 ring-inset ring-primary-200' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {person.firstName} {person.lastName}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleColors[person.role?.code ?? ''] || 'bg-gray-100 text-gray-800'}`}>
                          {person.role?.label || '—'}
                        </span>
                        {isExternal && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Andere relatie
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {contactName}
                        {person.email && ` · ${person.email}`}
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
            disabled={!selectedPersonId}
            isLoading={linkMutation.isPending}
          >
            Koppelen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
