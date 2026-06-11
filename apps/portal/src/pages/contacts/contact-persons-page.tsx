import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContactPerson } from '@/types';
import {
  ActionMenu,
  ErrorBox,
  Spinner,
  Button,
  Input,
  Table,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useContactPersons, useContactPersonRoles } from './hooks/use-contacts';
import { CreateContactPersonModal } from './components/create-contact-person-modal';
import { roleColors } from '@/lib/contact-person-role';

function getContactName(contact?: {
  type?: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function ContactPersonsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: roleOptions } = useContactPersonRoles();

  const { data, isLoading, error } = useContactPersons({
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

  const columns: ColumnDef<ContactPerson>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (person) =>
        [person.firstName, person.lastName].filter(Boolean).join(' '),
      render: (person) => (
        <button
          onClick={() => navigate(`/contacts/persons/${person.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {person.firstName} {person.lastName}
        </button>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterOptions: (roleOptions ?? []).map((r) => ({
        value: r.label,
        label: r.label,
      })),
      groupable: true,
      getFilterValue: (person) => person.role?.label ?? '',
      render: (person) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            roleColors[person.role?.code ?? ''] || 'bg-gray-100 text-gray-800'
          }`}
        >
          {person.role?.label || '—'}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (person) => person.email,
      render: (person) => (
        <span className="text-gray-600">{person.email || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: 'Telefoon',
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (person) => person.phone,
      render: (person) => (
        <span className="text-gray-600">{person.phone || '—'}</span>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (person) => getContactName(person.contact),
      render: (person) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/contacts/${person.contactId}`);
          }}
          className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
        >
          {getContactName(person.contact)}
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
  } = useTableConfig({ pageKey: 'contact-persons', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van contactpersonen: {error.message}</ErrorBox>
    );
  }

  const persons = data?.data || [];
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
          title="Contactpersonen"
          description="Overzicht van alle contactpersonen"
          actions={
            <ActionMenu
              secondaryActions={[
                {
                  label: 'Nieuw contactpersoon',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                  onClick: () => setIsCreateOpen(true),
                },
              ]}
            />
          }
        />

        {/* Search */}
        <div className="max-w-md">
          <Input
            placeholder="Zoeken op naam, e-mail..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(persons)}
          keyExtractor={(p) => p.id}
          emptyMessage="Geen contactpersonen gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} contactperso{total !== 1 ? 'nen' : 'on'} gevonden
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

      <CreateContactPersonModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </>
  );
}
