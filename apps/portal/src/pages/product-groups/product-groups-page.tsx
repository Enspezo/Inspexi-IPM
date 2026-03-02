import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProductGroup } from '@/types';
import { ActionMenu, Spinner, Button, Input, Table, type Column } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import { useProductGroups } from './hooks/use-product-groups';
import { CreateProductGroupModal } from './components/create-product-group-modal';

const canCreate = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function ProductGroupsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading, error } = useProductGroups({
    search: search || undefined,
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

  const userCanCreate = user && user.roles.some(r => canCreate.includes(r));

  const columns: Column<ProductGroup>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (group) => (
        <button
          onClick={() => navigate(`/products/groups/${group.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {group.name}
        </button>
      ),
    },
    {
      key: 'products',
      header: 'Aantal producten',
      render: (group) => (
        <span className="text-gray-600">{group._count?.products ?? 0}</span>
      ),
    },
    {
      key: 'notes',
      header: 'Notities',
      render: (group) => (
        <span className="block max-w-xs truncate text-gray-500">
          {group.notes || '—'}
        </span>
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
        Fout bij het laden van productgroepen: {error.message}
      </div>
    );
  }

  const groups = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <DetailPageLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Productgroepen</h2>
            <p className="mt-1 text-sm text-gray-500">
              Beheer productgroepen om uw catalogus te categoriseren
            </p>
          </div>
          {userCanCreate && (
            <ActionMenu
              primaryActions={[
                {
                  label: 'Productgroep aanmaken',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                  onClick: () => setIsCreateOpen(true),
                },
              ]}
            />
          )}
        </div>

        <div className="max-w-md">
          <Input
            placeholder="Zoeken op naam..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        <Table
          columns={columns}
          data={groups}
          keyExtractor={(g) => g.id}
          emptyMessage="Geen productgroepen gevonden"
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} productgroep{total !== 1 ? 'en' : ''} gevonden
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

        <CreateProductGroupModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      </div>
    </DetailPageLayout>
  );
}
