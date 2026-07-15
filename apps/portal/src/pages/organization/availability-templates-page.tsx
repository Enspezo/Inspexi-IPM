import { useState } from 'react';
import {
  ActionMenu,
  Button,
  ErrorBox,
  Spinner,
  StatusBadge,
  Table,
  useConfirm,
  useToast,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import type { AvailabilityTemplate } from '@/types';
import {
  useAvailabilityTemplates,
  useDeleteAvailabilityTemplate,
} from '@/pages/availability/hooks/use-availability';
import { TemplateEditorModal } from './components/template-editor-modal';
import {
  computeWeeklyMinutes,
  formatHours,
} from '@/components/availability/format-availability';

const ACTIVE_STATUS = {
  actief: { label: 'Actief', classes: 'bg-green-100 text-green-700' },
  inactief: { label: 'Inactief', classes: 'bg-gray-100 text-gray-500' },
};

export default function AvailabilityTemplatesPage() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data, isLoading, error } = useAvailabilityTemplates({ limit: 100 });
  const deleteMutation = useDeleteAvailabilityTemplate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AvailabilityTemplate | null>(null);

  const handleDelete = async (template: AvailabilityTemplate) => {
    const confirmed = await confirm({
      title: 'Template verwijderen',
      message: `Weet je zeker dat je "${template.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(template.id);
      showToast('Template verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation (bv. actieve toewijzingen) */
    }
  };

  const columns: ColumnDef<AvailabilityTemplate>[] = [
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
          onClick={() => setEditing(t)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {t.name}
        </button>
      ),
    },
    {
      key: 'description',
      header: 'Omschrijving',
      render: (t) => (
        <span className="block max-w-xs truncate text-sm text-gray-600">{t.description || '—'}</span>
      ),
    },
    {
      key: 'hours',
      header: 'Uren/week',
      sortable: true,
      getSortValue: (t) => computeWeeklyMinutes(t.slots),
      render: (t) => (
        <span className="text-sm text-gray-700">{formatHours(computeWeeklyMinutes(t.slots))}</span>
      ),
    },
    {
      key: 'assignmentCount',
      header: 'Toewijzingen',
      sortable: true,
      getSortValue: (t) => t.assignmentCount,
      render: (t) => <span className="text-sm text-gray-700">{t.assignmentCount}</span>,
    },
    {
      key: 'isActive',
      header: 'Status',
      filterable: true,
      filterType: 'boolean',
      sortable: true,
      getFilterValue: (t) => String(t.isActive),
      render: (t) => (
        <StatusBadge map={ACTIVE_STATUS} status={t.isActive ? 'actief' : 'inactief'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      pinned: true,
      pinnedPosition: 'end',
      sidebarLabel: 'Acties',
      render: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => setEditing(t)}>
            Bewerken
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(t)}
            isLoading={deleteMutation.isPending}
          >
            Verwijderen
          </Button>
        </div>
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
  } = useTableConfig({ pageKey: 'availability-templates', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorBox>Fout bij het laden van beschikbaarheidstemplates.</ErrorBox>;
  }

  const templates = data?.data || [];

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
          title="Beschikbaarheidstemplates"
          description="Herbruikbare weekschema's die je aan inspecteurs met een dienstverband toewijst"
          actions={
            <ActionMenu
              secondaryActions={[
                {
                  label: 'Template aanmaken',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                  onClick: () => setIsCreateOpen(true),
                },
              ]}
            />
          }
        />

        <Table
          columns={activeColumns}
          data={filteredData(templates)}
          keyExtractor={(t) => t.id}
          emptyMessage="Nog geen beschikbaarheidstemplates. Maak er één aan om te beginnen."
          sort={sort}
          onSort={toggleSort}
        />

        <TemplateEditorModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
        <TemplateEditorModal
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          template={editing}
        />
      </div>
    </DetailPageLayout>
  );
}
