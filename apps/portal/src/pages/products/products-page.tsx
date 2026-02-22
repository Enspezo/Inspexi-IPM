import { useState, useCallback } from 'react';
import type { Product } from '@/types';
import {
  Button,
  Spinner,
  Table,
  Input,
  Select,
  type Column,
} from '@/components/ui';
import { useProducts } from './hooks/use-products';
import { CreateProductModal } from './components/create-product-modal';
import { EditProductModal } from './components/edit-product-modal';

const statusOptions = [
  { value: '', label: 'Alle statussen' },
  { value: 'true', label: 'Actief' },
  { value: 'false', label: 'Inactief' },
];

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const { data, isLoading, error } = useProducts({
    search: search || undefined,
    isActive: statusFilter === '' ? undefined : statusFilter === 'true',
    page,
    limit: 20,
  });

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (product) => (
        <span className="font-medium text-gray-900">{product.name}</span>
      ),
    },
    {
      key: 'unit',
      header: 'Eenheid',
      render: (product) => (
        <span className="text-gray-600">{product.unit}</span>
      ),
    },
    {
      key: 'defaultVat',
      header: 'BTW %',
      render: (product) => (
        <span className="text-gray-600">{product.defaultVat}%</span>
      ),
    },
    {
      key: 'category',
      header: 'Categorie',
      render: (product) =>
        product.category ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {product.category}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'isActive',
      header: 'Status',
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
      render: (product) => (
        <button
          onClick={() => setEditProduct(product)}
          className="text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          Bewerken
        </button>
      ),
    },
  ];

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
        Fout bij het laden van producten: {error.message}
      </div>
    );
  }

  const products = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Producten</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer uw productcatalogus en diensten
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
          Product aanmaken
        </Button>
      </div>

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
        columns={columns}
        data={products}
        keyExtractor={(p) => p.id}
        emptyMessage="Geen producten gevonden"
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

      {editProduct && (
        <EditProductModal
          isOpen={!!editProduct}
          onClose={() => setEditProduct(null)}
          product={editProduct}
        />
      )}
    </div>
  );
}
