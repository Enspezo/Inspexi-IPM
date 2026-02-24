import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RequestStatus,
  Priority,
  Role,
} from '@/types';
import type { Request } from '@/types';
import {
  Button,
  Spinner,
  Table,
  Input,
  Select,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { useRequests } from './hooks/use-requests';
import { CreateRequestModal } from './components/create-request-modal';

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

const statusColors: Record<string, string> = {
  [RequestStatus.NIEUW]: 'bg-blue-100 text-blue-800',
  [RequestStatus.IN_BEHANDELING]: 'bg-yellow-100 text-yellow-800',
  [RequestStatus.OFFERTE_GEMAAKT]: 'bg-purple-100 text-purple-800',
  [RequestStatus.GEWONNEN]: 'bg-green-100 text-green-800',
  [RequestStatus.VERLOREN]: 'bg-red-100 text-red-800',
  [RequestStatus.ON_HOLD]: 'bg-gray-100 text-gray-600',
};

const statusLabels: Record<string, string> = {
  [RequestStatus.NIEUW]: 'Nieuw',
  [RequestStatus.IN_BEHANDELING]: 'In behandeling',
  [RequestStatus.OFFERTE_GEMAAKT]: 'Offerte gemaakt',
  [RequestStatus.GEWONNEN]: 'Gewonnen',
  [RequestStatus.VERLOREN]: 'Verloren',
  [RequestStatus.ON_HOLD]: 'On hold',
};

const priorityColors: Record<string, string> = {
  [Priority.HIGH]: 'bg-red-100 text-red-800',
  [Priority.NORMAL]: 'bg-yellow-100 text-yellow-800',
  [Priority.LOW]: 'bg-gray-100 text-gray-600',
};

const priorityLabels: Record<string, string> = {
  [Priority.HIGH]: 'Hoog',
  [Priority.NORMAL]: 'Normaal',
  [Priority.LOW]: 'Laag',
};

const sourceLabels: Record<string, string> = {
  MANUAL: 'Handmatig',
  WEB_FORM: 'Webformulier',
  EMAIL: 'E-mail',
  PHONE: 'Telefoon',
};

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactName(req: Request): string {
  if (!req.contact) return '—';
  if (req.contact.companyName) return req.contact.companyName;
  return [req.contact.firstName, req.contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function RequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading, error } = useRequests({
    search: search || undefined,
    status: (statusFilter as RequestStatus) || undefined,
    priority: (priorityFilter as Priority) || undefined,
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

  const userCanWrite = user && canWrite.includes(user.role);

  const columns: ColumnDef<Request>[] = [
    {
      key: 'title',
      header: 'Titel',
      pinned: true,
      render: (req) => (
        <button
          onClick={() => navigate(`/requests/${req.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {req.title}
        </button>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
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
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (req) => req.status,
      render: (req) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusColors[req.status] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {statusLabels[req.status] || req.status}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Prioriteit',
      filterable: true,
      filterType: 'select',
      filterOptions: priorityFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (req) => req.priority,
      render: (req) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            priorityColors[req.priority] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {priorityLabels[req.priority] || req.priority}
        </span>
      ),
    },
    {
      key: 'assignedUser',
      header: 'Toegewezen aan',
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
      filterable: true,
      filterType: 'select',
      filterOptions: Object.entries(sourceLabels).map(([value, label]) => ({
        value,
        label,
      })),
      groupable: true,
      getFilterValue: (req) => req.source,
      render: (req) => (
        <span className="text-gray-600">
          {sourceLabels[req.source] || req.source}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
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
  } = useTableConfig({ pageKey: 'requests', columns });

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
        Fout bij het laden van aanvragen: {error.message}
      </div>
    );
  }

  const requests = data?.data || [];
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Aanvragen</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer leads en aanvragen
          </p>
        </div>
        {userCanWrite && (
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
            Aanvraag aanmaken
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <Input
            placeholder="Zoeken op titel of relatie..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>
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
        <div className="w-48">
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

      <Table
        columns={activeColumns}
        data={filteredData(requests)}
        keyExtractor={(r) => r.id}
        emptyMessage="Geen aanvragen gevonden"
      />

      {/* Pagination */}
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

      <CreateRequestModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
    </DetailPageLayout>
  );
}
