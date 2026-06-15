// Constateringen-templates — PAGINATED overzichtspagina, gespiegeld op
// pages/inspections/inspections-page.tsx (DetailPageLayout + TableConfigSidebar +
// useTableConfig + ColumnDef + Table + PageHeader + server-paginatie).
// Overzicht-only: geen "Nieuw"-knop, geen detail-navigatie (omschrijving = platte tekst).
// isActive/isSystem als inline span (geen lookup/enum-badge).

import { useState, useCallback, useEffect } from 'react';
import type { FindingTemplate } from '@/types';
import { ErrorBox, Spinner, Table, Input, Button } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useFindingTemplates } from './hooks/use-finding-templates';

export default function FindingTemplatesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const columns: ColumnDef<FindingTemplate>[] = [
    {
      key: 'shortDescription',
      header: 'Omschrijving',
      pinned: true,
      sortable: true,
      sortKey: 'shortDescription',
      render: (t) => <span className="font-medium text-gray-900">{t.shortDescription}</span>,
    },
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      sortKey: 'code',
      getFilterValue: (t) => t.code ?? '',
      render: (t) =>
        t.code
          ? <span className="text-gray-600">{t.code}</span>
          : <span className="text-gray-400">—</span>,
    },
    {
      key: 'normReference',
      header: 'Normreferentie',
      sortable: true,
      sortKey: 'normReference',
      getFilterValue: (t) => t.normReference ?? '',
      render: (t) =>
        t.normReference
          ? <span className="text-gray-600">{t.normReference}</span>
          : <span className="text-gray-400">—</span>,
    },
    {
      key: 'usageCount',
      header: 'Gebruik',
      sortable: true,
      sortKey: 'usageCount',
      render: (t) => <span className="text-gray-600">{t.usageCount}</span>,
    },
    {
      key: 'isActive',
      header: 'Actief',
      filterable: true,
      filterType: 'boolean',
      groupable: true,
      sortable: true,
      sortKey: 'isActive',
      getFilterValue: (t) => t.isActive,
      render: (t) => (
        <span className={t.isActive ? 'text-green-700' : 'text-gray-400'}>
          {t.isActive ? 'Ja' : 'Nee'}
        </span>
      ),
    },
    {
      key: 'isSystem',
      header: 'Herkomst',
      filterable: true,
      filterType: 'boolean',
      groupable: true,
      sortable: true,
      sortKey: 'isSystem',
      getFilterValue: (t) => t.isSystem,
      render: (t) => (
        <span className={t.isSystem ? 'text-gray-500' : 'text-gray-700'}>
          {t.isSystem ? 'Systeem' : 'Eigen'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      sortable: true,
      sortKey: 'createdAt',
      getFilterValue: (t) => t.createdAt,
      render: (t) => (
        <span className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString('nl-NL')}</span>
      ),
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort, apiSort,
  } = useTableConfig({ pageKey: 'finding-templates', columns });

  useEffect(() => { setPage(1); }, [sort]);

  const { data, isLoading, error } = useFindingTemplates({
    search: search || undefined,
    page, limit: 20,
    sortBy: apiSort?.sortBy, sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden van constateringen-templates: {(error as Error).message}</ErrorBox>;

  const templates = data?.data || [];
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
        <PageHeader title="Constateringen-templates" description="Sjablonen voor constateringen" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op omschrijving / code..." value={search} onChange={handleSearchChange} />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(templates)}
          keyExtractor={(t) => t.id}
          emptyMessage="Geen constateringen-templates gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{total} {total !== 1 ? 'templates' : 'template'}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Vorige</Button>
              <span className="flex items-center px-3 text-sm text-gray-600">{page} / {totalPages}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Volgende</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{total} {total !== 1 ? 'templates' : 'template'}</p>
        )}
      </div>
    </DetailPageLayout>
  );
}
