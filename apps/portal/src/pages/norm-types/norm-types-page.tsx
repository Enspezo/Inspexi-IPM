// FLAT-array overzichtspagina (geen serverpaginatie): DetailPageLayout + TableConfigSidebar
// + useTableConfig + ColumnDef + Table + PageHeader. Zoeken is client-side.
// NB: dit model gebruikt 'label' i.p.v. 'name'. Verwijderde (soft-deleted) rijen worden
// getoond met gedempte styling + een per-rij "Herstellen"-actie (SUPERUSER).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { NormTypeDefinition } from '@/types';
import { Role } from '@/types';
import { ErrorBox, Spinner, Table, Input, Button, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { getErrorMessage } from '@/lib/api-client';
import { useNormTypes, useRestoreNormType } from './hooks/use-norm-types';
import { CreateNormTypeModal } from './components/create-norm-type-modal';

export default function NormTypesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Toon ook inactieve + verwijderde normtypes zodat herstel mogelijk is.
  const { data, isLoading, error } = useNormTypes({ includeInactive: true, includeDeleted: true });
  const restoreMutation = useRestoreNormType();

  const canManage = !!user && user.roles.includes(Role.SUPERUSER);

  const handleRestore = async (n: NormTypeDefinition) => {
    try {
      await restoreMutation.mutateAsync(n.id);
      showToast('Normtype hersteld', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const columns: ColumnDef<NormTypeDefinition>[] = [
    {
      key: 'label', header: 'Label', pinned: true, sortable: true, sortKey: 'label',
      render: (n) => (
        <Link
          to={`/norm-types/${n.id}`}
          className={`font-medium hover:underline ${
            n.deletedAt ? 'text-gray-400' : 'text-primary-600 hover:text-primary-700'
          }`}
        >
          {n.label}
        </Link>
      ),
    },
    {
      key: 'code', header: 'Code', sortable: true, sortKey: 'code',
      render: (n) => <span className={n.deletedAt ? 'text-gray-400' : 'text-gray-600'}>{n.code}</span>,
    },
    {
      key: 'sortOrder', header: 'Volgorde', sortable: true, sortKey: 'sortOrder',
      render: (n) => <span className={n.deletedAt ? 'text-gray-400' : 'text-gray-600'}>{n.sortOrder}</span>,
    },
    {
      key: 'isActive', header: 'Actief', filterable: true, filterType: 'boolean', groupable: true,
      getFilterValue: (n) => n.isActive,
      render: (n) => (
        <span className={n.isActive ? 'text-green-700' : 'text-gray-400'}>{n.isActive ? 'Ja' : 'Nee'}</span>
      ),
    },
    {
      key: 'deletedAt', header: 'Status', filterable: true, filterType: 'boolean', groupable: true,
      getFilterValue: (n) => !!n.deletedAt,
      render: (n) =>
        n.deletedAt
          ? <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Verwijderd</span>
          : <span className="text-gray-400">—</span>,
    },
    {
      key: 'createdAt', header: 'Aangemaakt', sortable: true, sortKey: 'createdAt',
      filterable: true, filterType: 'date', getFilterValue: (n) => n.createdAt,
      render: (n) => <span className="text-xs text-gray-500">{new Date(n.createdAt).toLocaleDateString('nl-NL')}</span>,
    },
    {
      key: 'actions', header: '', pinned: true, pinnedPosition: 'end', sidebarLabel: 'Acties',
      render: (n) =>
        n.deletedAt && canManage ? (
          <Button
            variant="secondary"
            onClick={() => handleRestore(n)}
            isLoading={restoreMutation.isPending && restoreMutation.variables === n.id}
          >
            Herstellen
          </Button>
        ) : null,
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort,
  } = useTableConfig({ pageKey: 'norm-types', columns });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden: {(error as Error).message}</ErrorBox>;

  const rows = data ?? [];
  const term = search.trim().toLowerCase();
  const searched = term
    ? rows.filter((r) => [r.label, r.code].some((v) => v?.toLowerCase().includes(term)))
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
          title="Normtypes"
          description="Globale normtype-registratie"
          actions={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>Nieuw normtype</Button>
            ) : undefined
          }
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op label of code..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(searched)}
          keyExtractor={(r) => r.id}
          emptyMessage="Niets gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        <p className="text-sm text-gray-500">{searched.length} resultaten</p>
      </div>

      <CreateNormTypeModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </DetailPageLayout>
  );
}
