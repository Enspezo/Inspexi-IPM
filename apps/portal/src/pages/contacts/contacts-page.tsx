import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contact } from '@/types';
import { ContactType } from '@/types';
import {
  ActionMenu,
  Button,
  Spinner,
  Table,
  Input,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import { useContacts } from './hooks/use-contacts';
import { CreateContactModal } from './components/create-contact-modal';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactDisplayName(contact: Contact): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

function getContactCity(contact: Contact): string {
  const primary = contact.addresses?.find((a) => a.isPrimary);
  const first = contact.addresses?.[0];
  return primary?.city || first?.city || '—';
}

function getOwnerName(contact: Contact): string {
  if (!contact.owner) return '—';
  return `${contact.owner.firstName} ${contact.owner.lastName}`;
}

export default function ContactsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(() => localStorage.getItem('inspexi:filter-mine:contacts') === 'true');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  const columns: ColumnDef<Contact>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      getSortValue: getContactDisplayName,
      render: (contact) => (
        <button
          onClick={() => navigate(`/contacts/${contact.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {getContactDisplayName(contact)}
        </button>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortKey: 'type',
      filterable: true,
      filterType: 'select',
      filterOptions: [
        { value: ContactType.COMPANY, label: 'Bedrijf' },
        { value: ContactType.INDIVIDUAL, label: 'Particulier' },
      ],
      groupable: true,
      getFilterValue: (contact) => contact.type,
      render: (contact) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            contact.type === ContactType.COMPANY
              ? 'bg-blue-100 text-blue-800'
              : 'bg-purple-100 text-purple-800'
          }`}
        >
          {contact.type === ContactType.COMPANY ? 'Bedrijf' : 'Particulier'}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      sortable: true,
      sortKey: 'email',
      filterable: true,
      filterType: 'text',
      getFilterValue: (contact) => contact.email,
      render: (contact) => (
        <span className="text-gray-600">{contact.email || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: 'Telefoon',
      sortable: true,
      sortKey: 'phone',
      filterable: true,
      filterType: 'text',
      getFilterValue: (contact) => contact.phone,
      render: (contact) => (
        <span className="text-gray-600">{contact.phone || '—'}</span>
      ),
    },
    {
      key: 'city',
      header: 'Stad',
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (contact) => getContactCity(contact),
      render: (contact) => (
        <span className="text-gray-600">{getContactCity(contact)}</span>
      ),
    },
    {
      key: 'owner',
      header: 'Eigenaar',
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (contact) => getOwnerName(contact),
      render: (contact) => (
        <span className="text-gray-600">{getOwnerName(contact)}</span>
      ),
    },
    {
      key: 'customerGroups',
      header: 'Klantgroep',
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (contact) =>
        (contact.customerGroups || [])
          .map((cg) => cg.customerGroup?.name || '')
          .join(', '),
      render: (contact) => {
        const groups = contact.customerGroups || [];
        if (groups.length === 0) return <span className="text-gray-400">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {groups.map((cg) => (
              <span
                key={cg.customerGroupId}
                className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
              >
                {cg.customerGroup?.name || '—'}
              </span>
            ))}
          </div>
        );
      },
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
    apiSort,
  } = useTableConfig({ pageKey: 'contacts', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useContacts({
    search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    onlyMine: onlyMine || undefined,
    page,
    limit: 20,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        Fout bij het laden van relaties: {error.message}
      </div>
    );
  }

  const contacts = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Relaties</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer uw klanten en contacten
          </p>
        </div>
        {userCanWrite && (
          <ActionMenu
            secondaryActions={[
              {
                label: 'Relatie aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                onClick: () => setIsCreateOpen(true),
              },
            ]}
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Zoeken op naam, e-mail, stad of telefoon..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors hover:border-gray-400">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={onlyMine}
            onChange={(e) => {
              setOnlyMine(e.target.checked);
              localStorage.setItem('inspexi:filter-mine:contacts', String(e.target.checked));
              setPage(1);
            }}
          />
          <span className="text-gray-700">Mijn relaties</span>
        </label>
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(contacts)}
        keyExtractor={(c) => c.id}
        emptyMessage="Geen relaties gevonden"
        sort={sort}
        onSort={toggleSort}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} relatie{total !== 1 ? 's' : ''} gevonden
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

      <CreateContactModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
    </DetailPageLayout>
  );
}
