import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TaskStatus,
  TaskEntityType,
  Role,
} from '@/types';
import type { Task } from '@/types';
import {
  ActionMenu,
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
import { useTasks } from './hooks/use-tasks';
import { CreateTaskModal } from './components/create-task-modal';

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: TaskStatus.TE_DOEN, label: 'Te doen' },
  { value: TaskStatus.MEE_BEZIG, label: 'Mee bezig' },
  { value: TaskStatus.VOLTOOID, label: 'Voltooid' },
];

const statusColors: Record<string, string> = {
  [TaskStatus.TE_DOEN]: 'bg-blue-100 text-blue-800',
  [TaskStatus.MEE_BEZIG]: 'bg-yellow-100 text-yellow-800',
  [TaskStatus.VOLTOOID]: 'bg-green-100 text-green-800',
};

const statusLabels: Record<string, string> = {
  [TaskStatus.TE_DOEN]: 'Te doen',
  [TaskStatus.MEE_BEZIG]: 'Mee bezig',
  [TaskStatus.VOLTOOID]: 'Voltooid',
};

const entityTypeLabels: Record<string, string> = {
  [TaskEntityType.CONTACT]: 'Relatie',
  [TaskEntityType.REQUEST]: 'Aanvraag',
  [TaskEntityType.QUOTE]: 'Offerte',
  [TaskEntityType.USER]: 'Gebruiker',
};

const entityTypeRoutes: Record<string, string> = {
  [TaskEntityType.CONTACT]: '/contacts',
  [TaskEntityType.REQUEST]: '/requests',
  [TaskEntityType.QUOTE]: '/quotes',
  [TaskEntityType.USER]: '/users',
};

function EntityIcon({ type }: { type: TaskEntityType }) {
  if (type === TaskEntityType.CONTACT) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    );
  }
  if (type === TaskEntityType.REQUEST) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (type === TaskEntityType.USER) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    );
  }
  // QUOTE or fallback
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 2v5a2 2 0 002 2h5" />
    </svg>
  );
}

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

export default function TasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyMine, setOnlyMine] = useState(() => localStorage.getItem('inspexi:filter-mine:tasks') === 'true');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useTasks({
    search: search || undefined,
    status: (statusFilter as TaskStatus) || undefined,
    onlyMine: onlyMine || undefined,
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

  const columns: ColumnDef<Task>[] = [
    {
      key: 'title',
      header: 'Titel',
      pinned: true,
      render: (task) => (
        <button
          onClick={() => navigate(`/tasks/${task.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {task.title}
        </button>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      getFilterValue: (task) => task.status,
      render: (task) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusColors[task.status] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {statusLabels[task.status] || task.status}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Gekoppeld aan',
      filterable: true,
      filterType: 'select',
      filterOptions: Object.entries(entityTypeLabels).map(([value, label]) => ({
        value,
        label,
      })),
      groupable: true,
      getFilterValue: (task) => task.entityType,
      render: (task) => (
        <button
          onClick={() => navigate(`${entityTypeRoutes[task.entityType]}/${task.entityId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 hover:underline"
          title={entityTypeLabels[task.entityType] || task.entityType}
        >
          <EntityIcon type={task.entityType} />
          <span className="truncate max-w-[200px]">
            {task.entityName || entityTypeLabels[task.entityType] || task.entityType}
          </span>
        </button>
      ),
    },
    {
      key: 'assignee',
      header: 'Toegewezen aan',
      filterable: true,
      filterType: 'text',
      getFilterValue: (task) =>
        task.assignee
          ? `${task.assignee.firstName} ${task.assignee.lastName}`
          : '',
      render: (task) =>
        task.assignee ? (
          <span className="text-gray-600">
            {task.assignee.firstName} {task.assignee.lastName}
          </span>
        ) : (
          <span className="text-gray-400">Niet toegewezen</span>
        ),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      filterable: true,
      filterType: 'date',
      getFilterValue: (task) => task.deadline,
      render: (task) => {
        if (!task.deadline) return <span className="text-gray-400">—</span>;
        const date = new Date(task.deadline);
        const isOverdue = task.status !== TaskStatus.VOLTOOID && date < new Date();
        return (
          <span className={`text-xs ${isOverdue ? 'font-medium text-red-600' : 'text-gray-500'}`}>
            {date.toLocaleDateString('nl-NL')}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      getFilterValue: (task) => task.createdAt,
      render: (task) => (
        <span className="text-gray-500 text-xs">
          {new Date(task.createdAt).toLocaleDateString('nl-NL')}
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
  } = useTableConfig({ pageKey: 'tasks', columns });

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
        Fout bij het laden van taken: {error.message}
      </div>
    );
  }

  const tasks = data?.data || [];
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
          <h2 className="text-2xl font-bold text-gray-900">Taken</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer en volg taken op
          </p>
        </div>
        {userCanWrite && (
          <ActionMenu
            primaryActions={[
              {
                label: 'Taak aanmaken',
                icon: (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                ),
                onClick: () => setIsCreateOpen(true),
              },
            ]}
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Zoeken op titel..."
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
        <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors hover:border-gray-400">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={onlyMine}
            onChange={(e) => {
              setOnlyMine(e.target.checked);
              localStorage.setItem('inspexi:filter-mine:tasks', String(e.target.checked));
              setPage(1);
            }}
          />
          <span className="text-gray-700">Mijn taken</span>
        </label>
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(tasks)}
        keyExtractor={(t) => t.id}
        emptyMessage="Geen taken gevonden"
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} {total !== 1 ? 'taken' : 'taak'} gevonden
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
    </div>

      {isCreateOpen && (
        <CreateTaskModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      )}
    </DetailPageLayout>
  );
}
