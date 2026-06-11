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
  Table,
  Modal,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useLocations, useContacts } from './hooks/use-contacts';
import { AddLocationModal } from './components/add-location-modal';

const objectTypeOptions = [
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

function getLocationAddress(location: LocationWithContact): string {
  return `${location.street} ${location.houseNumber}, ${location.postalCode} ${location.city}`;
}

export default function LocationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isSelectContactOpen, setIsSelectContactOpen] = useState(false);
  const [createContactId, setCreateContactId] = useState<string | null>(null);

  const { data, isLoading, error } = useLocations({
    search: search || undefined,
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

  const columns: ColumnDef<LocationWithContact>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (location) => location.name,
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
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (location) => getLocationAddress(location),
      render: (location) => (
        <span className="text-gray-600">
          {location.street} {location.houseNumber}, {location.postalCode} {location.city}
        </span>
      ),
    },
    {
      key: 'city',
      header: 'Stad',
      defaultVisible: false,
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (location) => location.city,
      render: (location) => (
        <span className="text-gray-600">{location.city || '—'}</span>
      ),
    },
    {
      key: 'objectType',
      header: 'Type',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterOptions: objectTypeOptions,
      groupable: true,
      getFilterValue: (location) => location.objectType ?? '',
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
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (location) =>
        location.contact ? getContactName(location.contact) : '',
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

  const {
    activeColumns,
    filteredData,
    pendingColumnConfig,
    setPendingColumnConfig,
    pendingFilters,
    setPendingFilters,
    pendingGrouping,
    setPendingGrouping,
    applyColumns,
    applyFilters,
    resetToDefaults,
    isColumnsDirty,
    isFiltersDirty,
    allColumns,
    sort,
    toggleSort,
  } = useTableConfig({ pageKey: 'locations', columns });

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
      <DetailPageLayout
        sidebar={
          <TableConfigSidebar
            columns={allColumns}
            pendingColumnConfig={pendingColumnConfig}
            onColumnConfigChange={setPendingColumnConfig}
            pendingFilters={pendingFilters}
            onFiltersChange={setPendingFilters}
            pendingGrouping={pendingGrouping}
            onGroupingChange={setPendingGrouping}
            onApplyColumns={applyColumns}
            onApplyFilters={applyFilters}
            onReset={resetToDefaults}
            isColumnsDirty={isColumnsDirty}
            isFiltersDirty={isFiltersDirty}
          />
        }
      >
        <div className="space-y-6">
          <PageHeader
            title="Locaties"
            description="Overzicht van alle locaties"
            actions={
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
            }
          />

          {/* Search */}
          <div className="max-w-md">
            <Input
              placeholder="Zoeken op naam, adres, stad..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>

          <Table
            columns={activeColumns}
            data={filteredData(locations)}
            keyExtractor={(l) => l.id}
            emptyMessage="Geen locaties gevonden"
            sort={sort}
            onSort={toggleSort}
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
