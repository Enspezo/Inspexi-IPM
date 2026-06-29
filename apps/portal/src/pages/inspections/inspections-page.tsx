// GOLDEN PATH overzichtspagina, gespiegeld op pages/tasks/tasks-page.tsx
// (DetailPageLayout + TableConfigSidebar + useTableConfig + ColumnDef + Table + PageHeader).
// Verschil: status is een LOOKUP → <LookupBadge> i.p.v. <StatusBadge>; filteropties komen
// dynamisch uit useLookups. Dit patroon herhaalt voor alle inspectie-overzichten.

import { useState, useCallback, useEffect } from 'react';
import { Role, type InspectionPlan } from '@/types';
import { ErrorBox, Spinner, Table, Input, Select, Button, ActionMenu } from '@/components/ui';
import { LookupBadge } from '@/components/ui/lookup-badge';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { TableConfigSidebar, useTableConfig, type ColumnDef } from '@/components/table-config';
import { useLookups } from '@/lib/lookups';
import { useAuth } from '@/providers/auth-provider';
import { useWindowTabs } from '@/providers/window-tabs';
import { useInspectionPlans } from './hooks/use-inspections';
import { CreateInspectionModal } from './components/create-inspection-modal';

const canWriteRoles = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

function contactName(plan: InspectionPlan): string {
  const c = plan.contact;
  if (!c) return '—';
  return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

export default function InspectionsPage() {
  const { openTab } = useWindowTabs();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const userCanWrite = !!user && user.roles.some((r) => canWriteRoles.includes(r));

  // Filteropties dynamisch uit de plan-status lookup (systeemdefaults + org-overrides)
  const { data: planStatuses } = useLookups('plan-status-types');
  const statusFilterOptions = [
    { value: '', label: 'Alle statussen' },
    ...(planStatuses ?? []).map((s) => ({ value: s.code, label: s.label })),
  ];

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const columns: ColumnDef<InspectionPlan>[] = [
    {
      key: 'projectName', header: 'Project', pinned: true, sortable: true, sortKey: 'projectName',
      render: (p) => (
        <button
          // Opens the inspectie as an in-window tab. ⌘/Ctrl- or middle-click
          // opens it in the background without switching away from the list.
          onClick={(e) =>
            openTab('inspection', p.id, p.projectName, {
              background: e.metaKey || e.ctrlKey,
            })
          }
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              openTab('inspection', p.id, p.projectName, { background: true });
            }
          }}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {p.projectName}
        </button>
      ),
    },
    {
      key: 'contact', header: 'Opdrachtgever', sortable: false,
      render: (p) => <span className="text-gray-600">{contactName(p)}</span>,
    },
    {
      key: 'statusCode', header: 'Status', filterable: true, filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''), groupable: true,
      sortable: true, sortKey: 'statusCode',
      getFilterValue: (p) => p.statusCode,
      render: (p) => <LookupBadge kind="plan-status-types" code={p.statusCode} />,
    },
    {
      key: 'inspectionTypeCode', header: 'Type', groupable: true,
      getFilterValue: (p) => p.inspectionTypeCode,
      render: (p) => <LookupBadge kind="inspection-types" code={p.inspectionTypeCode} />,
    },
    {
      key: 'plannedDate', header: 'Gepland', filterable: true, filterType: 'date',
      sortable: true, sortKey: 'plannedDate', getFilterValue: (p) => p.plannedDate,
      render: (p) =>
        p.plannedDate
          ? <span className="text-xs text-gray-500">{new Date(p.plannedDate).toLocaleDateString('nl-NL')}</span>
          : <span className="text-gray-400">—</span>,
    },
    {
      key: 'createdAt', header: 'Aangemaakt', filterable: true, filterType: 'date',
      sortable: true, sortKey: 'createdAt', getFilterValue: (p) => p.createdAt,
      render: (p) => <span className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString('nl-NL')}</span>,
    },
  ];

  const {
    activeColumns, filteredData, pendingColumnConfig, setPendingColumnConfig,
    pendingFilters, setPendingFilters, pendingGrouping, setPendingGrouping,
    applyColumns, applyFilters, resetToDefaults, isColumnsDirty, isFiltersDirty,
    allColumns, sort, toggleSort, apiSort,
  } = useTableConfig({ pageKey: 'inspections', columns });

  useEffect(() => { setPage(1); }, [sort]);

  const { data, isLoading, error } = useInspectionPlans({
    search: search || undefined,
    statusCode: statusFilter || undefined,
    page, limit: 20,
    sortBy: apiSort?.sortBy, sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden van inspecties: {(error as Error).message}</ErrorBox>;

  const plans = data?.data || [];
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
          title="Inspecties"
          description="Inspectieplannen volgen en beoordelen"
          actions={
            userCanWrite ? (
              <ActionMenu
                secondaryActions={[
                  {
                    label: 'Inspectie aanmaken',
                    icon: (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    ),
                    onClick: () => setIsCreateOpen(true),
                  },
                ]}
              />
            ) : undefined
          }
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input placeholder="Zoeken op project / referentie..." value={search} onChange={handleSearchChange} />
          </div>
          <div className="w-48">
            <Select
              options={statusFilterOptions}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(plans)}
          keyExtractor={(p) => p.id}
          emptyMessage="Geen inspecties gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{total} {total !== 1 ? 'inspecties' : 'inspectie'}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Vorige</Button>
              <span className="flex items-center px-3 text-sm text-gray-600">{page} / {totalPages}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Volgende</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{total} {total !== 1 ? 'inspecties' : 'inspectie'}</p>
        )}
      </div>

      {isCreateOpen && (
        <CreateInspectionModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      )}
    </DetailPageLayout>
  );
}
