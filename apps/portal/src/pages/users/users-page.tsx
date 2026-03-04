import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '@/types';
import {
  ActionMenu,
  Table,
  Badge,
  Spinner,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useUsers } from './hooks/use-users';
import { InviteUserModal } from './components/invite-user-modal';

export default function UsersPage() {
  const { data: users, isLoading, error } = useUsers();
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const columns: ColumnDef<User>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (user) => `${user.firstName} ${user.lastName}`,
      render: (user) => (
        <Link
          to={`/users/${user.id}`}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {user.firstName} {user.lastName}
        </Link>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (user) => user.email,
      render: (user) => (
        <span className="text-gray-600">{user.email}</span>
      ),
    },
    {
      key: 'initials',
      header: 'Initialen',
      sortable: true,
      render: (user) => (
        <span className="font-mono text-sm text-gray-700">
          {user.initials || <span className="text-gray-400">—</span>}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      filterable: true,
      filterType: 'text',
      groupable: true,
      sortable: true,
      getFilterValue: (user) => user.roles.join(', '),
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <Badge key={r} role={r} />
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      filterType: 'boolean',
      groupable: true,
      sortable: true,
      getFilterValue: (user) => String(user.isActive),
      render: (user) => (
        <span
          className={`inline-flex items-center gap-1.5 text-sm ${
            user.isActive ? 'text-green-700' : 'text-gray-500'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              user.isActive ? 'bg-green-500' : 'bg-gray-300'
            }`}
          />
          {user.isActive ? 'Actief' : 'Inactief'}
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
  } = useTableConfig({ pageKey: 'users', columns });

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
        Fout bij het laden van gebruikers: {error.message}
      </div>
    );
  }

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
          <h2 className="text-2xl font-bold text-gray-900">Gebruikers</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer de gebruikers van uw organisatie
          </p>
        </div>
        <ActionMenu
          primaryActions={[
            {
              label: 'Uitnodigen',
              icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
              onClick: () => setIsInviteOpen(true),
            },
          ]}
        />
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(users || [])}
        keyExtractor={(user) => user.id}
        emptyMessage="Geen gebruikers gevonden"
        sort={sort}
        onSort={toggleSort}
      />

      <InviteUserModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />
    </div>
    </DetailPageLayout>
  );
}
