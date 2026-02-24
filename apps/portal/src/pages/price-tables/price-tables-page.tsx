import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PriceTable } from '@/types';
import {
  Button,
  Spinner,
  Table,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
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

  const { data, isLoading, error } = usePriceTables();

  const columns: ColumnDef<PriceTable>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
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
  } = useTableConfig({ pageKey: 'price-tables', columns });

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
        Fout bij het laden van prijstabellen: {error.message}
      </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Prijstabellen</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer tarieven en klantspecifieke prijzen
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
          Prijstabel aanmaken
        </Button>
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(tables)}
        keyExtractor={(t) => t.id}
        emptyMessage="Geen prijstabellen gevonden"
      />

      <CreatePriceTableModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
    </DetailPageLayout>
  );
}
