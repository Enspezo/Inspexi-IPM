import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CustomerGroup } from '@/types';
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
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import { useCustomerGroups } from './hooks/use-customer-groups';
import { CreateCustomerGroupModal } from './components/create-customer-group-modal';

const canCreate = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function CustomerGroupsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading, error } = useCustomerGroups({
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

  const userCanCreate = user && user.roles.some(r => canCreate.includes(r));

  const columns: ColumnDef<CustomerGroup>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (group) => group.name,
      render: (group) => (
        <button
          onClick={() => navigate(`/contacts/groups/${group.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {group.name}
        </button>
      ),
    },
    {
      key: 'contacts',
      header: 'Aantal relaties',
      sortable: true,
      getSortValue: (group) => group._count?.contacts ?? 0,
      render: (group) => (
        <span className="text-gray-600">
          {group._count?.contacts ?? 0}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notities',
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (group) => group.notes,
      render: (group) => (
        <span className="text-gray-500 truncate max-w-xs block">
          {group.notes || '—'}
        </span>
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
  } = useTableConfig({ pageKey: 'customer-groups', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van klantgroepen: {error.message}</ErrorBox>
    );
  }

  const groups = data?.data || [];
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
        <PageHeader
          title="Klantgroepen"
          description="Beheer klantgroepen om relaties te categoriseren"
          actions={
            userCanCreate && (
              <ActionMenu
                secondaryActions={[
                  {
                    label: 'Klantgroep aanmaken',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                    onClick: () => setIsCreateOpen(true),
                  },
                ]}
              />
            )
          }
        />

        {/* Search */}
        <div className="max-w-md">
          <Input
            placeholder="Zoeken op naam..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(groups)}
          keyExtractor={(g) => g.id}
          emptyMessage="Geen klantgroepen gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} klantgroep{total !== 1 ? 'en' : ''} gevonden
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

        <CreateCustomerGroupModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      </div>
    </DetailPageLayout>
  );
}
