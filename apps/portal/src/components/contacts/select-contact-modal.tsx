import { useState } from 'react';
import { ContactType } from '@/types';
import { Modal, Input, Button, Spinner } from '@/components/ui';
import { useContacts } from '@/pages/contacts/hooks/use-contacts';

interface SelectContactModalProps {
  /** Called with the chosen contact id. */
  onSelect: (contactId: string) => void;
  onClose: () => void;
  title?: string;
}

/**
 * Searchable picker for selecting an existing relatie. Used as the first step
 * of flows that need a contactId (e.g. adding a location) — shared between the
 * locations overview and the global quick-create flow.
 */
export function SelectContactModal({
  onSelect,
  onClose,
  title = 'Selecteer een relatie',
}: SelectContactModalProps) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useContacts({ search: search || undefined, limit: 10 });
  const contacts = data?.data || [];

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className="space-y-4">
        <Input
          placeholder="Zoeken op naam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : contacts.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">Geen relaties gevonden</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {contacts.map((contact) => {
              const name =
                contact.type === ContactType.COMPANY
                  ? contact.companyName || '—'
                  : [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
              return (
                <li key={contact.id}>
                  <button
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => onSelect(contact.id)}
                  >
                    <span className="font-medium text-gray-900">{name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
        </div>
      </div>
    </Modal>
  );
}
