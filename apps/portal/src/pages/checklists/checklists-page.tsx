// Overzichtspagina (FLAT array) — gespiegeld op pages/inspections/inspections-page.tsx,
// maar zonder server-paginatie: het /checklists endpoint geeft een platte Checklist[].
// Zoeken gebeurt client-side; status is een StatusBadge (geen lookup).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Role, type Checklist } from '@/types';
import { Button, ErrorBox, Spinner, Table, Input, StatusBadge } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { CHECKLIST_STATUS } from '@/lib/status';
import { useChecklists } from './hooks/use-checklists';
import { CreateChecklistModal } from './components/create-checklist-modal';
import { ImportChecklistModal } from './components/import-checklist-modal';

const MANAGE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function ChecklistsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { user } = useAuth();
  const { data, isLoading, error } = useChecklists();

  const canManage = !!user && user.roles.some((r) => MANAGE_ROLES.includes(r));

  const columns: ColumnDef<Checklist>[] = [
    {
      key: 'name', header: 'Naam', pinned: true, sortable: true, sortKey: 'name',
      render: (c) => (
        <Link to={`/checklists/${c.id}`} className="font-medium text-primary-600 hover:text-primary-700 hover:underline">
          {c.name}
        </Link>
      ),
    },
    {
      key: 'code', header: 'Code', sortable: true, sortKey: 'code',
      render: (c) => <span className="text-gray-600">{c.code || '—'}</span>,
    },
    {
      key: 'normTypeCode', header: 'Normtype', sortable: true, sortKey: 'normTypeCode',
      render: (c) => <span className="text-gray-600">{c.normTypeCode}</span>,
    },
    {
      key: 'version', header: 'Versie', sortable: true, sortKey: 'version',
      render: (c) => <span className="text-gray-600">{c.version}</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true, sortKey: 'status',
      filterable: true, filterType: 'select',
      filterOptions: Object.entries(CHECKLIST_STATUS).map(([value, { label }]) => ({ value, label })),
      groupable: true, getFilterValue: (c) => c.status,
      render: (c) => <StatusBadge status={c.status} map={CHECKLIST_STATUS} />,
    },
    {
      key: 'isSystem', header: 'Herkomst', sortable: true, sortKey: 'isSystem',
      filterable: true, filterType: 'boolean', getFilterValue: (c) => c.isSystem,
      render: (c) => <span className="text-gray-600">{c.isSystem ? 'Systeem' : 'Eigen'}</span>,
    },
    {
      key: 'createdAt', header: 'Aangemaakt', filterable: true, filterType: 'date',
      sortable: true, sortKey: 'createdAt', getFilterValue: (c) => c.createdAt,
      render: (c) => <span className="text-xs text-gray-500">{new Date(c.createdAt).toLocaleDateString('nl-NL')}</span>,
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort,
  } = useTableConfig({ pageKey: 'checklists', columns });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden van checklists: {(error as Error).message}</ErrorBox>;

  const rows = data ?? [];
  const term = search.trim().toLowerCase();
  const searched = term
    ? rows.filter((r) => [r.name, r.code].some((v) => v?.toLowerCase().includes(term)))
    : rows;

  return (
    <DetailPageLayout
      sidebar={
        <TableConfigSidebar
          columns={allColumns}
          pendingColumnConfig={pendingColumnConfig} onColumnConfigChange={setPendingColumnConfig}
          pendingFilters={pendingFilters} onFiltersChange={setPendingFilters}
          pendingGrouping={pendingGrouping} onGroupingChange={setPendingGrouping}
          onApplyColumns={applyColumns} onApplyFilters={applyFilters} onReset={resetToDefaults}
          isColumnsDirty={isColumnsDirty} isFiltersDirty={isFiltersDirty}
        />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Checklists"
          description="Inspectie-checklists beheren en doorzoeken"
          actions={
            canManage ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  Importeren
                </Button>
                <Button onClick={() => setCreateOpen(true)}>Nieuw checklist</Button>
              </div>
            ) : undefined
          }
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op naam of code..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(searched)}
          keyExtractor={(r) => r.id}
          emptyMessage="Geen checklists gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        <p className="text-sm text-gray-500">{searched.length} {searched.length !== 1 ? 'resultaten' : 'resultaat'}</p>
      </div>

      <CreateChecklistModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportChecklistModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
    </DetailPageLayout>
  );
}
