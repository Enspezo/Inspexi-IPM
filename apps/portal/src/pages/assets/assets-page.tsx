// Org-breed assetregister — PAGINATED overzichtspagina, gespiegeld op
// pages/inspections/inspections-page.tsx (DetailPageLayout + TableConfigSidebar +
// useTableConfig + ColumnDef + Table + PageHeader + server-paginatie).
// Status is een LOOKUP → <LookupBadge>; filteropties dynamisch uit useLookups.
// Overzicht-only: geen "Nieuw"-knop, geen detail-navigatie (naam = platte tekst).

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Asset } from '@/types';
import { ErrorBox, Spinner, Table, Input, Select, Button } from '@/components/ui';
import { LookupBadge } from '@/components/ui/lookup-badge';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useLookups } from '@/lib/lookups';
import { useAssets } from './hooks/use-assets';

export default function AssetsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Filteropties dynamisch uit de asset-status lookup (systeemdefaults + org-overrides)
  const { data: assetStatuses } = useLookups('asset-status-types');
  const statusFilterOptions = [
    { value: '', label: 'Alle statussen' },
    ...(assetStatuses ?? []).map((s) => ({ value: s.code, label: s.label })),
  ];

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const columns: ColumnDef<Asset>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      sortKey: 'name',
      render: (a) => (
        <button
          onClick={() => navigate(`/assets/${a.id}`)}
          className="text-left font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          {a.name}
        </button>
      ),
    },
    {
      key: 'identifier',
      header: 'Kenmerk',
      sortable: true,
      sortKey: 'identifier',
      getFilterValue: (a) => a.identifier ?? '',
      render: (a) =>
        a.identifier
          ? <span className="text-gray-600">{a.identifier}</span>
          : <span className="text-gray-400">—</span>,
    },
    {
      key: 'assetType',
      header: 'Type',
      sortable: true,
      sortKey: 'assetType',
      groupable: true,
      getFilterValue: (a) => a.assetType,
      render: (a) => <span className="text-gray-600">{a.assetType}</span>,
    },
    {
      key: 'statusCode',
      header: 'Status',
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      sortable: true,
      sortKey: 'statusCode',
      getFilterValue: (a) => a.statusCode,
      render: (a) => <LookupBadge kind="asset-status-types" code={a.statusCode} />,
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      sortable: true,
      sortKey: 'createdAt',
      getFilterValue: (a) => a.createdAt,
      render: (a) => (
        <span className="text-xs text-gray-500">{new Date(a.createdAt).toLocaleDateString('nl-NL')}</span>
      ),
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort, apiSort,
  } = useTableConfig({ pageKey: 'assets', columns });

  useEffect(() => { setPage(1); }, [sort]);

  const { data, isLoading, error } = useAssets({
    search: search || undefined,
    statusCode: statusFilter || undefined,
    page, limit: 20,
    sortBy: apiSort?.sortBy, sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden van assets: {(error as Error).message}</ErrorBox>;

  const assets = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

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
        <PageHeader title="Assets" description="Org-breed assetregister" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op naam / kenmerk..." value={search} onChange={handleSearchChange} />
          </div>
          <div className="w-48">
            <Select
              options={statusFilterOptions}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(assets)}
          keyExtractor={(a) => a.id}
          emptyMessage="Geen assets gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{total} {total !== 1 ? 'assets' : 'asset'}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Vorige</Button>
              <span className="flex items-center px-3 text-sm text-gray-600">{page} / {totalPages}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Volgende</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{total} {total !== 1 ? 'assets' : 'asset'}</p>
        )}
      </div>
    </DetailPageLayout>
  );
}
