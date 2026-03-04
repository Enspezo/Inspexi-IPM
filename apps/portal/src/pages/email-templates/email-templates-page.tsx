import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionMenu, Button, Spinner, Table } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useToast } from '@/components/ui';
import type { EmailTemplate } from '@/types';
import { useEmailTemplates, useDeleteEmailTemplate } from './hooks/use-email-templates';
import { CreateEmailTemplateModal } from './components/create-email-template-modal';
import { EMAIL_TYPE_LABELS } from './components/email-type-labels';

export default function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading, error } = useEmailTemplates({ page, limit: 50 });
  const deleteMutation = useDeleteEmailTemplate();

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Weet u zeker dat u dit sjabloon wilt deactiveren?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      showToast('Sjabloon gedeactiveerd', 'success');
    } catch {
      showToast('Deactiveren mislukt', 'error');
    }
  };

  const columns: ColumnDef<EmailTemplate>[] = [
    {
      key: 'name',
      header: 'Naam',
      pinned: true,
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (t) => t.name,
      render: (t) => (
        <button
          onClick={() => navigate(`/email-templates/${t.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {t.name}
        </button>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      filterable: true,
      filterType: 'select',
      sortable: true,
      getFilterValue: (t) => t.type,
      render: (t) => (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {EMAIL_TYPE_LABELS[t.type] ?? t.type}
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Onderwerp',
      sortable: true,
      render: (t) => (
        <span className="text-gray-600 text-sm truncate max-w-xs block">{t.subject}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Actief',
      filterable: true,
      filterType: 'boolean',
      sortable: true,
      getFilterValue: (t) => String(t.isActive),
      render: (t) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            t.isActive
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {t.isActive ? 'Actief' : 'Inactief'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      sortable: true,
      getFilterValue: (t) => t.createdAt,
      render: (t) => (
        <span className="text-gray-500 text-xs">
          {new Date(t.createdAt).toLocaleDateString('nl-NL')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      pinned: true,
      pinnedPosition: 'end',
      sidebarLabel: 'Acties',
      render: (t) =>
        t.isActive ? (
          <Button
            variant="danger"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeactivate(t.id);
            }}
            isLoading={deleteMutation.isPending}
          >
            Deactiveren
          </Button>
        ) : null,
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
  } = useTableConfig({ pageKey: 'email-templates', columns });

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
        Fout bij het laden van sjablonen: {(error as Error).message}
      </div>
    );
  }

  const templates = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

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
            <h2 className="text-2xl font-bold text-gray-900">E-mailsjablonen</h2>
            <p className="mt-1 text-sm text-gray-500">
              Beheer de e-mailtemplates voor uw organisatie
            </p>
          </div>
          <ActionMenu
            secondaryActions={[
              {
                label: 'Sjabloon aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                onClick: () => setIsCreateOpen(true),
              },
            ]}
          />
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(templates)}
          keyExtractor={(t) => t.id}
          emptyMessage="Geen e-mailsjablonen gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} sjablo{total !== 1 ? 'nen' : 'on'} gevonden
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

        <CreateEmailTemplateModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onCreated={(t) => navigate(`/email-templates/${t.id}`)}
        />
      </div>
    </DetailPageLayout>
  );
}
