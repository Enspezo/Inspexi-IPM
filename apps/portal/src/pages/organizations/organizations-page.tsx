import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Organization } from '@/types';
import {
  Button,
  Table,
  Spinner,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useOrganizations } from './hooks/use-organizations';
import { CreateOrganizationModal } from './components/create-organization-modal';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const { data: organizations, isLoading, error } = useOrganizations();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const columns: ColumnDef<Organization>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (org) => org.name,
      render: (org) => (
        <button
          onClick={() => navigate(`/organizations/${org.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {org.name}
        </button>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      filterable: true,
      filterType: 'text',
      getFilterValue: (org) => org.slug,
      render: (org) => (
        <span className="font-mono text-sm text-gray-600">{org.slug}</span>
      ),
    },
    {
      key: 'primaryColor',
      header: 'Kleur',
      render: (org) =>
        org.primaryColor ? (
          <div className="flex items-center gap-2">
            <div
              className="h-5 w-5 rounded border border-gray-200"
              style={{ backgroundColor: org.primaryColor }}
            />
            <span className="font-mono text-xs text-gray-500">
              {org.primaryColor}
            </span>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'defaultVat',
      header: 'BTW',
      render: (org) => (
        <span className="text-gray-700">{org.defaultVat}%</span>
      ),
    },
    {
      key: 'defaultValidityDays',
      header: 'Geldigheid',
      render: (org) => (
        <span className="text-gray-700">
          {org.defaultValidityDays} dagen
        </span>
      ),
    },
    {
      key: 'userCount',
      header: 'Gebruikers',
      render: (org) => (
        <span className="text-gray-700">{org._count?.users ?? 0}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      getFilterValue: (org) => org.createdAt,
      render: (org) => (
        <span className="text-gray-500">{formatDate(org.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      pinned: true,
      pinnedPosition: 'end',
      sidebarLabel: 'Acties',
      className: 'text-right',
      render: (org) => (
        <button
          onClick={() => navigate(`/organizations/${org.id}`)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
        >
          Bekijken
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
  } = useTableConfig({ pageKey: 'organizations', columns });

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
        Fout bij het laden van organisaties: {error.message}
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
            <h2 className="text-2xl font-bold text-gray-900">Organisaties</h2>
            <p className="mt-1 text-sm text-gray-500">
              Beheer alle organisaties op het platform
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nieuwe organisatie
          </Button>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(organizations || [])}
          keyExtractor={(org) => org.id}
          emptyMessage="Geen organisaties gevonden"
        />

        <CreateOrganizationModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      </div>
    </DetailPageLayout>
  );
}
