import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PriceTable } from '@/types';
import {
  ActionMenu,
  Button,
  ErrorBox,
  Spinner,
  Table,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { usePriceTables } from './hooks/use-price-tables';
import { CreatePriceTableModal } from './components/create-price-table-modal';

export default function PriceTablesPage() {
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const columns: ColumnDef<PriceTable>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      sortKey: 'name',
      render: (table) => (
        <button
          onClick={() => navigate(`/price-tables/${table.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {table.name}
        </button>
      ),
    },
    {
      key: 'description',
      header: 'Beschrijving',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (table) => table.description,
      render: (table) => (
        <span className="text-gray-600">{table.description || '—'}</span>
      ),
    },
    {
      key: 'isDefault',
      header: 'Standaard',
      filterable: true,
      filterType: 'boolean',
      sortable: true,
      sortKey: 'isDefault',
      getFilterValue: (table) => String(table.isDefault),
      render: (table) =>
        table.isDefault ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Standaard
          </span>
        ) : null,
    },
    {
      key: 'items',
      header: 'Producten',
      sortable: true,
      getSortValue: (table) => table._count?.items ?? 0,
      render: (table) => (
        <span className="text-gray-600">{table._count?.items || 0}</span>
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
    apiSort,
  } = useTableConfig({ pageKey: 'price-tables', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = usePriceTables({
    page,
    limit: 20,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van prijstabellen: {error.message}</ErrorBox>
    );
  }

  const tables = data?.data || [];

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
        title="Prijstabellen"
        description="Beheer tarieven en klantspecifieke prijzen"
        actions={
          <ActionMenu
            secondaryActions={[
              {
                label: 'Prijstabel aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                onClick: () => setIsCreateOpen(true),
              },
            ]}
          />
        }
      />

      <Table
        columns={activeColumns}
        data={filteredData(tables)}
        keyExtractor={(t) => t.id}
        emptyMessage="Geen prijstabellen gevonden"
        sort={sort}
        onSort={toggleSort}
      />

      <CreatePriceTableModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
    </DetailPageLayout>
  );
}
