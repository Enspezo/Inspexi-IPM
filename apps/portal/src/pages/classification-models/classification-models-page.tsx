// FLAT-array overzichtspagina (geen serverpaginatie): DetailPageLayout + TableConfigSidebar
// + useTableConfig + ColumnDef + Table + PageHeader. Zoeken is client-side.
// SUPERUSER-beheer: gebruikt de admin-endpoint (incl. inactieve modellen) + aanmaak-modal.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Role, type ClassificationModel } from '@/types';
import { ErrorBox, Spinner, Table, Input, Button } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { useClassificationModelsAdmin } from './hooks/use-classification-models';
import { CreateClassificationModelModal } from './components/create-classification-model-modal';

export default function ClassificationModelsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { user } = useAuth();
  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  const { data, isLoading, error } = useClassificationModelsAdmin();

  const columns: ColumnDef<ClassificationModel>[] = [
    {
      key: 'name', header: 'Naam', pinned: true, sortable: true, sortKey: 'name',
      render: (m) => (
        <Link to={`/classification-models/${m.id}`} className="font-medium text-primary-600 hover:underline">
          {m.name}
        </Link>
      ),
    },
    {
      key: 'code', header: 'Code', sortable: true, sortKey: 'code',
      render: (m) => <span className="text-gray-600">{m.code}</span>,
    },
    {
      key: 'description', header: 'Omschrijving',
      render: (m) => <span className="text-gray-600 line-clamp-1">{m.description || '—'}</span>,
    },
    {
      key: 'isActive', header: 'Actief', filterable: true, filterType: 'boolean', groupable: true,
      getFilterValue: (m) => m.isActive,
      render: (m) => (
        <span className={m.isActive ? 'text-green-700' : 'text-gray-400'}>{m.isActive ? 'Ja' : 'Nee'}</span>
      ),
    },
    {
      key: 'createdAt', header: 'Aangemaakt', sortable: true, sortKey: 'createdAt',
      filterable: true, filterType: 'date', getFilterValue: (m) => m.createdAt,
      render: (m) => <span className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleDateString('nl-NL')}</span>,
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort,
  } = useTableConfig({ pageKey: 'classification-models', columns });

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
        <PageHeader
          title="Classificatiemodellen"
          description="Beheer classificatiemodellen en hun kenmerken"
          actions={
            isSuperuser ? <Button onClick={() => setCreateOpen(true)}>Nieuw</Button> : undefined
          }
        />

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

      <CreateClassificationModelModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </DetailPageLayout>
  );
}
