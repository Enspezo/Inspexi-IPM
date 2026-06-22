import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '@/types';
import {
  ActionMenu,
  Button,
  ErrorBox,
  Spinner,
  Table,
  Input,
  Select,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useProducts } from './hooks/use-products';
import { CreateProductModal } from './components/create-product-modal';

const statusOptions = [
  { value: '', label: 'Alle statussen' },
  { value: 'true', label: 'Actief' },
  { value: 'false', label: 'Inactief' },
];

export default function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const columns: ColumnDef<Product>[] = [
    {
      key: 'productCode',
      header: 'Productcode',
      pinned: true,
      sortable: true,
      sortKey: 'productCode',
      filterable: true,
      filterType: 'text',
      getFilterValue: (product) => product.productCode ?? '',
      render: (product) => (
        <span className="font-mono text-sm text-gray-700">{product.productCode ?? '—'}</span>
      ),
    },
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      sortable: true,
      sortKey: 'name',
      filterable: true,
      filterType: 'text',
      getFilterValue: (product) => product.name,
      render: (product) => (
        <button
          onClick={() => navigate(`/products/${product.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {product.name}
        </button>
      ),
    },
    {
      key: 'unit',
      header: 'Eenheid',
      sortable: true,
      sortKey: 'unit',
      filterable: true,
      filterType: 'text',
      getFilterValue: (product) => product.unit,
      render: (product) => (
        <span className="text-gray-600">{product.unit}</span>
      ),
    },
    {
      key: 'defaultVat',
      header: 'BTW %',
      sortable: true,
      sortKey: 'defaultVat',
      render: (product) => (
        <span className="text-gray-600">{product.defaultVat}%</span>
      ),
    },
    {
      key: 'productGroup',
      header: 'Productgroep',
      sortable: true,
      filterable: true,
      filterType: 'text',
      groupable: true,
      getFilterValue: (product) => product.productGroup?.name ?? null,
      render: (product) =>
        product.productGroup ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {product.productGroup.name}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'isActive',
      header: 'Status',
      sortable: true,
      sortKey: 'isActive',
      filterable: true,
      filterType: 'boolean',
      groupable: true,
      getFilterValue: (product) => String(product.isActive),
      render: (product) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            product.isActive
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {product.isActive ? 'Actief' : 'Inactief'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      pinned: true,
      pinnedPosition: 'end',
      sidebarLabel: 'Acties',
      render: (product) => (
        <button
          onClick={() => navigate(`/products/${product.id}`)}
          className="text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          Bewerken
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
    sort,
    toggleSort,
    apiSort,
  } = useTableConfig({ pageKey: 'products', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useProducts({
    search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    isActive: statusFilter === '' ? undefined : statusFilter === 'true',
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
      <ErrorBox>Fout bij het laden van producten: {error.message}</ErrorBox>
    );
  }

  const products = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

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
        title="Producten"
        description="Beheer uw productcatalogus en diensten"
        actions={
          <ActionMenu
            secondaryActions={[
              {
                label: 'Product aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                onClick: () => setIsCreateOpen(true),
              },
            ]}
          />
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <Input
            placeholder="Zoeken op naam..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>
        <div className="w-48">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(products)}
        keyExtractor={(p) => p.id}
        emptyMessage="Geen producten gevonden"
        sort={sort}
        onSort={toggleSort}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} product{total !== 1 ? 'en' : ''} gevonden
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Vorige
            </Button>
            <span className="flex items-center px-3 text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}

      <CreateProductModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
    </DetailPageLayout>
  );
}
