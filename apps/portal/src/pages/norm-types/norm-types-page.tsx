// FLAT-array overzichtspagina (geen serverpaginatie): DetailPageLayout + TableConfigSidebar
// + useTableConfig + ColumnDef + Table + PageHeader. Zoeken is client-side.
// NB: dit model gebruikt 'label' i.p.v. 'name'.

import { useState } from 'react';
import type { NormTypeDefinition } from '@/types';
import { ErrorBox, Spinner, Table, Input } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useNormTypes } from './hooks/use-norm-types';

export default function NormTypesPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useNormTypes();

  const columns: ColumnDef<NormTypeDefinition>[] = [
    {
      key: 'label', header: 'Label', pinned: true, sortable: true, sortKey: 'label',
      render: (n) => <span className="font-medium text-gray-900">{n.label}</span>,
    },
    {
      key: 'code', header: 'Code', sortable: true, sortKey: 'code',
      render: (n) => <span className="text-gray-600">{n.code}</span>,
    },
    {
      key: 'sortOrder', header: 'Volgorde', sortable: true, sortKey: 'sortOrder',
      render: (n) => <span className="text-gray-600">{n.sortOrder}</span>,
    },
    {
      key: 'isActive', header: 'Actief', filterable: true, filterType: 'boolean', groupable: true,
      getFilterValue: (n) => n.isActive,
      render: (n) => (
        <span className={n.isActive ? 'text-green-700' : 'text-gray-400'}>{n.isActive ? 'Ja' : 'Nee'}</span>
      ),
    },
    {
      key: 'deletedAt', header: 'Status',
      render: (n) =>
        n.deletedAt
          ? <span className="text-red-700">Verwijderd</span>
          : <span className="text-gray-400">—</span>,
    },
    {
      key: 'createdAt', header: 'Aangemaakt', sortable: true, sortKey: 'createdAt',
      filterable: true, filterType: 'date', getFilterValue: (n) => n.createdAt,
      render: (n) => <span className="text-xs text-gray-500">{new Date(n.createdAt).toLocaleDateString('nl-NL')}</span>,
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
        <PageHeader title="Normtypes" description="Globale normtype-registratie" />

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
    </DetailPageLayout>
  );
}
