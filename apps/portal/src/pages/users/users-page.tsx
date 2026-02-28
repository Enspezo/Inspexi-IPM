import { useState, useRef, useEffect } from 'react';
import type { User } from '@/types';
import {
  Button,
  Table,
  Badge,
  Spinner,
  useToast,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useUsers, useDeactivateUser, useActivateUser } from './hooks/use-users';
import { InviteUserModal } from './components/invite-user-modal';
import { ChangeRoleModal } from './components/change-role-modal';
import { ResetPasswordModal } from './components/reset-password-modal';
import { EditUserModal } from './components/edit-user-modal';

export default function UsersPage() {
  const { data: users, isLoading, error } = useUsers();
  const deactivateMutation = useDeactivateUser();
  const activateMutation = useActivateUser();
  const { showToast } = useToast();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [changeRoleUser, setChangeRoleUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleDeactivate = async (userId: string) => {
    try {
      await deactivateMutation.mutateAsync(userId);
      showToast('Gebruiker gedeactiveerd', 'success');
    } catch {
      showToast('Deactiveren mislukt', 'error');
    }
    setOpenDropdownId(null);
  };

  const handleActivate = async (userId: string) => {
    try {
      await activateMutation.mutateAsync(userId);
      showToast('Gebruiker geactiveerd', 'success');
    } catch {
      showToast('Activeren mislukt', 'error');
    }
    setOpenDropdownId(null);
  };

  const columns: ColumnDef<User>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      render: (user) => (
        <div>
          <p className="font-medium text-gray-900">
            {user.firstName} {user.lastName}
          </p>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      filterable: true,
      filterType: 'text',
      getFilterValue: (user) => user.email,
      render: (user) => (
        <span className="text-gray-600">{user.email}</span>
      ),
    },
    {
      key: 'initials',
      header: 'Initialen',
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
    {
      key: 'actions',
      header: 'Acties',
      pinned: true,
      pinnedPosition: 'end',
      sidebarLabel: 'Acties',
      className: 'text-right',
      render: (user) => (
        <div className="relative flex justify-end" ref={openDropdownId === user.id ? dropdownRef : undefined}>
          <button
            onClick={() =>
              setOpenDropdownId(openDropdownId === user.id ? null : user.id)
            }
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {openDropdownId === user.id && (
            <div
              className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              style={{ animation: 'fade-in 0.1s ease-out' }}
            >
              <button
                onClick={() => {
                  setEditUser(user);
                  setOpenDropdownId(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Bewerken
              </button>
              <button
                onClick={() => {
                  setChangeRoleUser(user);
                  setOpenDropdownId(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Rol wijzigen
              </button>
              <button
                onClick={() => {
                  setResetPasswordUser(user);
                  setOpenDropdownId(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Wachtwoord resetten
              </button>
              {user.isActive ? (
                <button
                  onClick={() => handleDeactivate(user.id)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Deactiveren
                </button>
              ) : (
                <button
                  onClick={() => handleActivate(user.id)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Activeren
                </button>
              )}
            </div>
          )}
        </div>
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
        <Button onClick={() => setIsInviteOpen(true)}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Uitnodigen
        </Button>
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(users || [])}
        keyExtractor={(user) => user.id}
        emptyMessage="Geen gebruikers gevonden"
      />

      <InviteUserModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />

      {editUser && (
        <EditUserModal
          isOpen={!!editUser}
          onClose={() => setEditUser(null)}
          user={editUser}
        />
      )}

      <ChangeRoleModal
        isOpen={!!changeRoleUser}
        onClose={() => setChangeRoleUser(null)}
        user={changeRoleUser}
      />

      <ResetPasswordModal
        isOpen={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        user={resetPasswordUser}
      />
    </div>
    </DetailPageLayout>
  );
}
