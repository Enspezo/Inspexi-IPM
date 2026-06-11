import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ContactType } from '@/types';
import type { Location } from '@/types';
import {
  ActionMenu,
  ErrorBox,
  Spinner,
  Button,
  Input,
  Select,
  Table,
  Modal,
  type Column,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useLocations, useContacts } from './hooks/use-contacts';
import { AddLocationModal } from './components/add-location-modal';

const objectTypeFilterOptions = [
  { value: '', label: 'Alle typen' },
  { value: 'woning', label: 'Woning' },
  { value: 'kantoor', label: 'Kantoor' },
  { value: 'industrieel', label: 'Industrieel' },
  { value: 'winkel', label: 'Winkel' },
  { value: 'overig', label: 'Overig' },
];

const objectTypeColors: Record<string, string> = {
  woning: 'bg-blue-100 text-blue-800',
  kantoor: 'bg-purple-100 text-purple-800',
  industrieel: 'bg-orange-100 text-orange-800',
  winkel: 'bg-green-100 text-green-800',
  overig: 'bg-gray-100 text-gray-800',
};

type LocationWithContact = Location & {
  contact?: {
    id: string;
    type: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

function getContactName(contact?: LocationWithContact['contact']): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function LocationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [objectTypeFilter, setObjectTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isSelectContactOpen, setIsSelectContactOpen] = useState(false);
  const [createContactId, setCreateContactId] = useState<string | null>(null);

  const { data, isLoading, error } = useLocations({
    search: search || undefined,
    objectType: objectTypeFilter || undefined,
    page,
    limit: 20,
  });

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const columns: Column<LocationWithContact>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (location) => (
        <button
          onClick={() => navigate(`/contacts/locations/${location.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {location.name}
        </button>
      ),
    },
    {
      key: 'address',
      header: 'Adres',
      render: (location) => (
        <span className="text-gray-600">
          {location.street} {location.houseNumber}, {location.postalCode} {location.city}
        </span>
      ),
    },
    {
      key: 'objectType',
      header: 'Type',
      render: (location) =>
        location.objectType ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              objectTypeColors[location.objectType] || 'bg-gray-100 text-gray-800'
            }`}
          >
            {location.objectType.charAt(0).toUpperCase() + location.objectType.slice(1)}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      render: (location) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (location.contact) navigate(`/contacts/${location.contact.id}`);
          }}
          className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
        >
          {getContactName(location.contact)}
        </button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van locaties: {error.message}</ErrorBox>
    );
  }

  const locations = (data?.data || []) as LocationWithContact[];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <DetailPageLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Locaties</h2>
              <p className="mt-1 text-sm text-gray-500">
                Overzicht van alle locaties
              </p>
            </div>
            <ActionMenu
              secondaryActions={[
                {
                  label: 'Nieuwe locatie',
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  ),
                  onClick: () => setIsSelectContactOpen(true),
                },
              ]}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Zoeken op naam, adres, stad..."
                value={search}
                onChange={handleSearchChange}
              />
            </div>
            <div className="w-48">
              <Select
                options={objectTypeFilterOptions}
                value={objectTypeFilter}
                onChange={(e) => {
                  setObjectTypeFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <Table
            columns={columns}
            data={locations}
            keyExtractor={(l) => l.id}
            emptyMessage="Geen locaties gevonden"
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {total} locatie{total !== 1 ? 's' : ''} gevonden
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Vorige
                </Button>
                <span className="flex items-center px-3 text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Volgende
                </Button>
              </div>
            </div>
          )}
        </div>
      </DetailPageLayout>

      {isSelectContactOpen && (
        <SelectContactModal
          onSelect={(contactId) => {
            setCreateContactId(contactId);
            setIsSelectContactOpen(false);
          }}
          onClose={() => setIsSelectContactOpen(false)}
        />
      )}

      {createContactId && (
        <AddLocationModal
          isOpen
          contactId={createContactId}
          onClose={() => setCreateContactId(null)}
        />
      )}
    </>
  );
}

// ─── Modal: select a contact before adding a location ──

function SelectContactModal({
  onSelect,
  onClose,
}: {
  onSelect: (contactId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useContacts({ search: search || undefined, limit: 10 });
  const contacts = data?.data || [];

  return (
    <Modal isOpen onClose={onClose} title="Selecteer een relatie">
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
