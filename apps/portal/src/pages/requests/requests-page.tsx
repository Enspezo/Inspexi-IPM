import { tenantStorage } from '@/lib/storage';
import { useState, useCallback, useEffect } from 'react';
import {
  RequestStatus,
  Priority,
  Role,
} from '@/types';
import type { Request } from '@/types';
import {
  ActionMenu,
  Button,
  ErrorBox,
  Spinner,
  StatusBadge,
  Table,
  Input,
  Select,
} from '@/components/ui';
import { PRIORITY, REQUEST_SOURCE_LABELS, REQUEST_STATUS } from '@/lib/status';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { useWindowTabs } from '@/providers/window-tabs';
import { useRequests } from './hooks/use-requests';
import { CreateRequestModal } from './components/create-request-modal';
import { RequestsKanban } from './components/requests-kanban';

type ViewMode = 'table' | 'kanban';

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: RequestStatus.NIEUW, label: 'Nieuw' },
  { value: RequestStatus.IN_BEHANDELING, label: 'In behandeling' },
  { value: RequestStatus.OFFERTE_GEMAAKT, label: 'Offerte gemaakt' },
  { value: RequestStatus.GEWONNEN, label: 'Gewonnen' },
  { value: RequestStatus.VERLOREN, label: 'Verloren' },
  { value: RequestStatus.ON_HOLD, label: 'On hold' },
];

const priorityFilterOptions = [
  { value: '', label: 'Alle prioriteiten' },
  { value: Priority.HIGH, label: 'Hoog' },
  { value: Priority.NORMAL, label: 'Normaal' },
  { value: Priority.LOW, label: 'Laag' },
];

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactName(req: Request): string {
  if (!req.contact) return '—';
  if (req.contact.companyName) return req.contact.companyName;
  return [req.contact.firstName, req.contact.lastName].filter(Boolean).join(' ') || '—';
}

// ─── Iconen voor de toggle knoppen ────────────────────────────────────────

function TableIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h18M3 6h18M3 14h18M3 18h18"
      />
    </svg>
  );
}

function KanbanIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  );
}

// ─── Hoofd-component ───────────────────────────────────────────────────────

export default function RequestsPage() {
  const { user } = useAuth();
  const { openTab } = useWindowTabs();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [onlyMine, setOnlyMine] = useState(() => tenantStorage.getItem('filter-mine:requests') === 'true');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (tenantStorage.getItem('requests-view-mode') as ViewMode | null) ?? 'table',
  );

  const handleSetViewMode = (mode: ViewMode) => {
    tenantStorage.setItem('requests-view-mode', mode);
    setViewMode(mode);
  };

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  const columns: ColumnDef<Request>[] = [
    {
      key: 'requestNumber',
      header: 'Nummer',
      pinned: true,
      sortable: true,
      sortKey: 'requestNumber',
      filterable: true,
      filterType: 'text',
      getFilterValue: (req) => req.requestNumber ?? '',
      render: (req) => (
        <span className="font-mono text-sm text-gray-700">{req.requestNumber ?? '—'}</span>
      ),
    },
    {
      key: 'title',
      header: 'Titel',
      pinned: true,
      sortable: true,
      sortKey: 'title',
      render: (req) => (
        <button
          // Opens the aanvraag as an in-window tab. ⌘/Ctrl- or middle-click
          // opens it in the background without switching away from the list.
          onClick={(e) =>
            openTab('request', req.id, req.title, {
              background: e.metaKey || e.ctrlKey,
            })
          }
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              openTab('request', req.id, req.title, { background: true });
            }
          }}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {req.title}
        </button>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (req) => getContactName(req),
      render: (req) => (
        <span className="text-gray-600">{getContactName(req)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortKey: 'status',
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (req) => req.status,
      render: (req) => <StatusBadge status={req.status} map={REQUEST_STATUS} />,
    },
    {
      key: 'priority',
      header: 'Prioriteit',
      sortable: true,
      sortKey: 'priority',
      filterable: true,
      filterType: 'select',
      filterOptions: priorityFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (req) => req.priority,
      render: (req) => <StatusBadge status={req.priority} map={PRIORITY} />,
    },
    {
      key: 'assignedUser',
      header: 'Toegewezen aan',
      sortable: true,
      filterable: true,
      filterType: 'text',
      getFilterValue: (req) =>
        req.assignedUser
          ? `${req.assignedUser.firstName} ${req.assignedUser.lastName}`
          : '',
      render: (req) =>
        req.assignedUser ? (
          <span className="text-gray-600">
            {req.assignedUser.firstName} {req.assignedUser.lastName}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'source',
      header: 'Bron',
      sortable: true,
      sortKey: 'source',
      filterable: true,
      filterType: 'select',
      filterOptions: Object.entries(REQUEST_SOURCE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      groupable: true,
      getFilterValue: (req) => req.source,
      render: (req) => (
        <span className="text-gray-600">
          {REQUEST_SOURCE_LABELS[req.source] || req.source}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      sortable: true,
      sortKey: 'createdAt',
      filterable: true,
      filterType: 'date',
      getFilterValue: (req) => req.createdAt,
      render: (req) => (
        <span className="text-gray-500 text-xs">
          {new Date(req.createdAt).toLocaleDateString('nl-NL')}
        </span>
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
  } = useTableConfig({ pageKey: 'requests', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useRequests({
    search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
    status: (statusFilter as RequestStatus) || undefined,
    priority: (priorityFilter as Priority) || undefined,
    assignedTo: onlyMine ? user?.id : undefined,
    page,
    limit: 20,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  if (isLoading && viewMode === 'table') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && viewMode === 'table') {
    return (
      <ErrorBox>
        Fout bij het laden van aanvragen: {error.message}
      </ErrorBox>
    );
  }

  const requests = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <DetailPageLayout
      sidebar={
        <div className="space-y-6">
          {/* Snelfilters */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Snelfilters</h3>
            <div>
              <Select
                options={priorityFilterOptions}
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Tabelconfiguratie — alleen in tabelweergave */}
          {viewMode === 'table' && (
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
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Aanvragen"
          description="Beheer leads en aanvragen"
          actions={
            <>
              {/* Weergave toggle */}
              <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
                <button
                  onClick={() => handleSetViewMode('table')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'table'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Tabelweergave"
                >
                  <TableIcon />
                  Lijst
                </button>
                <button
                  onClick={() => handleSetViewMode('kanban')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'kanban'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Kanban-weergave"
                >
                  <KanbanIcon />
                  Kanban
                </button>
              </div>

              {userCanWrite && (
                <ActionMenu
                  secondaryActions={[
                    {
                      label: 'Aanvraag aanmaken',
                      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                      onClick: () => setIsCreateOpen(true),
                    },
                  ]}
                />
              )}
            </>
          }
        />

        {/* Filters — statusfilter alleen in tabelweergave */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Zoeken op titel of relatie..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          {viewMode === 'table' && (
            <div className="w-48">
              <Select
                options={statusFilterOptions}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors hover:border-gray-400">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={onlyMine}
              onChange={(e) => {
                setOnlyMine(e.target.checked);
                tenantStorage.setItem('filter-mine:requests', String(e.target.checked));
                setPage(1);
              }}
            />
            <span className="text-gray-700">Mijn aanvragen</span>
          </label>
        </div>

        {/* Inhoud */}
        {viewMode === 'kanban' ? (
          <RequestsKanban search={debouncedSearch.length >= 3 ? debouncedSearch : undefined} priorityFilter={priorityFilter} assignedTo={onlyMine ? user?.id : undefined} />
        ) : (
          <>
            <Table
              columns={activeColumns}
              data={filteredData(requests)}
              keyExtractor={(r) => r.id}
              emptyMessage="Geen aanvragen gevonden"
              sort={sort}
              onSort={toggleSort}
            />

            {/* Paginering */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {total} aanvra{total !== 1 ? 'gen' : 'ag'} gevonden
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
          </>
        )}

        <CreateRequestModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      </div>
    </DetailPageLayout>
  );
}
