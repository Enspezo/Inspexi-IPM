// FLAT-array overzichtspagina (geen serverpaginatie): DetailPageLayout + TableConfigSidebar
// + useTableConfig + ColumnDef + Table + PageHeader. Zoeken is client-side.

import { useState } from 'react';
import type { AssetTypeDefinition } from '@/types';
import { ErrorBox, Spinner, Table, Input } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useAssetTypes } from './hooks/use-asset-types';

export default function AssetTypesPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useAssetTypes();

  const columns: ColumnDef<AssetTypeDefinition>[] = [
    {
      key: 'name', header: 'Naam', pinned: true, sortable: true, sortKey: 'name',
      render: (t) => <span className="font-medium text-gray-900">{t.name}</span>,
    },
    {
      key: 'code', header: 'Code', sortable: true, sortKey: 'code',
      render: (t) => <span className="text-gray-600">{t.code}</span>,
    },
    {
      key: 'color', header: 'Kleur',
      render: (t) => (
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-4 w-4 rounded border border-gray-200" style={{ backgroundColor: t.color || 'transparent' }} />
          {t.color || '—'}
        </span>
      ),
    },
    {
      key: 'isActive', header: 'Actief', filterable: true, filterType: 'boolean', groupable: true,
      getFilterValue: (t) => t.isActive,
      render: (t) => (
        <span className={t.isActive ? 'text-green-700' : 'text-gray-400'}>{t.isActive ? 'Ja' : 'Nee'}</span>
      ),
    },
    {
      key: 'isSystem', header: 'Herkomst', groupable: true,
      getFilterValue: (t) => t.isSystem,
      render: (t) => <span className="text-gray-600">{t.isSystem ? 'Systeem' : 'Eigen'}</span>,
    },
    {
      key: 'sortOrder', header: 'Volgorde', sortable: true, sortKey: 'sortOrder',
      render: (t) => <span className="text-gray-600">{t.sortOrder}</span>,
    },
    {
      key: 'createdAt', header: 'Aangemaakt', sortable: true, sortKey: 'createdAt',
      filterable: true, filterType: 'date', getFilterValue: (t) => t.createdAt,
      render: (t) => <span className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString('nl-NL')}</span>,
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort,
  } = useTableConfig({ pageKey: 'asset-types', columns });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden: {(error as Error).message}</ErrorBox>;

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
        <PageHeader title="Asset-types" description="Type-definities voor assets" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op naam of code..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
