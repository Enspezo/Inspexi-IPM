// Constateringen-templates — PAGINATED overzichtspagina (DetailPageLayout + TableConfigSidebar
// + useTableConfig + ColumnDef + Table + PageHeader + server-paginatie).
// Omschrijving linkt naar /finding-templates/:id. Header: Nieuw / Exporteren / Importeren.
// isActive/isSystem als inline span (geen lookup/enum-badge).

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role, type FindingTemplate } from '@/types';
import { ErrorBox, Spinner, Table, Input, Button, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { getAccessToken, getErrorMessage } from '@/lib/api-client';
import { useFindingTemplates } from './hooks/use-finding-templates';
import { CreateFindingTemplateModal } from './components/create-finding-template-modal';
import { ImportFindingTemplatesModal } from './components/import-finding-templates-modal';

const MANAGE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function FindingTemplatesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canManage = !!user && user.roles.some((r) => MANAGE_ROLES.includes(r));

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  // Exporteer alle (zichtbare) templates naar een JSON-download. Geen ids → backend exporteert alles.
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/v1/finding-templates/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export mislukt');
      // Endpoint geeft { success, data: FindingTemplateExport }; we downloaden de data zelf.
      const body = await res.json();
      const data = body?.data ?? body;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `constateringen-templates-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export gedownload', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Export mislukt'), 'error');
    } finally {
      setExporting(false);
    }
  }, [showToast]);

  const columns: ColumnDef<FindingTemplate>[] = [
    {
      key: 'shortDescription',
      header: 'Omschrijving',
      pinned: true,
      sortable: true,
      sortKey: 'shortDescription',
      render: (t) => (
        <button
          onClick={() => navigate(`/finding-templates/${t.id}`)}
          className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          {t.shortDescription}
        </button>
      ),
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
        <PageHeader
          title="Constateringen-templates"
          description="Sjablonen voor constateringen"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={handleExport} isLoading={exporting}>
                Exporteren
              </Button>
              {canManage && (
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  Importeren
                </Button>
              )}
              {canManage && (
                <Button onClick={() => setCreateOpen(true)}>Nieuw constatering-template</Button>
              )}
            </div>
          }
        />

        <CreateFindingTemplateModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
        <ImportFindingTemplatesModal isOpen={importOpen} onClose={() => setImportOpen(false)} />

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
