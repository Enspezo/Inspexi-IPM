import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectStatus, Role } from '@/types';
import type { Project } from '@/types';
import { ActionMenu, Button, Spinner, StatusBadge, Table, Input, Select } from '@/components/ui';
import { PROJECT_STATUS } from '@/lib/status';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { useProjects } from './hooks/use-projects';
import { CreateProjectModal } from './components/create-project-modal';
import { ProjectManagerFilter, type ProjectManagerOption } from './components/project-manager-filter';

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: ProjectStatus.ACTIEF, label: 'Actief' },
  { value: ProjectStatus.ON_HOLD, label: 'On hold' },
  { value: ProjectStatus.AFGEROND, label: 'Afgerond' },
  { value: ProjectStatus.GEANNULEERD, label: 'Geannuleerd' },
];

const canWrite = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
];

const PAGE_KEY = 'projects-list';

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const hasWrite = user?.roles.some((r) => canWrite.includes(r));

  const columns: ColumnDef<Project>[] = [
    {
      key: 'projectNumber',
      header: 'Projectnummer',
      pinned: true,
      pinnedPosition: 'start',
      filterable: true,
      filterType: 'text',
      sortable: true,
      sortKey: 'projectNumber',
      sidebarLabel: 'Projectnummer',
      render: (row) => (
        <button
          className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
          onClick={() => navigate(`/projects/${row.id}`)}
        >
          {row.projectNumber}
        </button>
      ),
    },
    {
      key: 'title',
      header: 'Titel',
      filterable: true,
      filterType: 'text',
      sortable: true,
      sortKey: 'title',
      sidebarLabel: 'Titel',
      render: (row) => (
        <span className="font-medium text-gray-900">{row.title}</span>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      filterable: true,
      filterType: 'text',
      sortable: true,
      sidebarLabel: 'Relatie',
      getFilterValue: (row) =>
        row.contact?.companyName ||
        [row.contact?.firstName, row.contact?.lastName]
          .filter(Boolean)
          .join(' ') ||
        '',
      render: (row) => {
        if (!row.contact) return <span className="text-gray-400">—</span>;
        return (
          <span className="text-gray-700">
            {row.contact.companyName ||
              [row.contact.firstName, row.contact.lastName]
                .filter(Boolean)
                .join(' ')}
          </span>
        );
      },
    },
    {
      key: 'projectManager',
      header: 'Projectmanager',
      filterable: true,
      filterType: 'text',
      sortable: true,
      sidebarLabel: 'Projectmanager',
      getFilterValue: (row) =>
        row.projectManager
          ? `${row.projectManager.firstName} ${row.projectManager.lastName}`
          : '',
      render: (row) => {
        if (!row.projectManager)
          return <span className="text-gray-400">—</span>;
        return (
          <span className="text-gray-700">
            {row.projectManager.firstName} {row.projectManager.lastName}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      filterType: 'select',
      sortable: true,
      sortKey: 'status',
      sidebarLabel: 'Status',
      getFilterValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} map={PROJECT_STATUS} />,
    },
    {
      key: 'startDate',
      header: 'Startdatum',
      filterable: true,
      filterType: 'date',
      sortable: true,
      sortKey: 'startDate',
      sidebarLabel: 'Startdatum',
      render: (row) =>
        row.startDate
          ? new Date(row.startDate).toLocaleDateString('nl-NL')
          : '—',
    },
    {
      key: 'expectedEndDate',
      header: 'Verwachte einddatum',
      filterable: true,
      filterType: 'date',
      sortable: true,
      sortKey: 'expectedEndDate',
      sidebarLabel: 'Verwachte einddatum',
      render: (row) =>
        row.expectedEndDate
          ? new Date(row.expectedEndDate).toLocaleDateString('nl-NL')
          : '—',
    },
  ];

  const {
    activeColumns,
    filteredData,
    allColumns,
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
    sort,
    toggleSort,
    apiSort,
  } = useTableConfig({ pageKey: PAGE_KEY, columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useProjects({
    search: search || undefined,
    status: (statusFilter as ProjectStatus) || undefined,
    page,
    limit: 20,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  // Derive unique project managers from loaded data
  const allProjects: Project[] = data?.data ?? [];

  const projectManagers = useMemo((): ProjectManagerOption[] => {
    const map = new Map<string, ProjectManagerOption>();
    allProjects.forEach((p) => {
      if (p.projectManager && !map.has(p.projectManager.id)) {
        const firstName = p.projectManager.firstName ?? '';
        const lastName = p.projectManager.lastName ?? '';
        map.set(p.projectManager.id, {
          id: p.projectManager.id,
          name: `${firstName} ${lastName}`.trim() || (p.projectManager.email ?? '?'),
          color: p.projectManager.color ?? '#6B7280',
          initials:
            p.projectManager.initials ??
            `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase(),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allProjects]);

  // Client-side project manager filter
  const filteredByManager = useMemo((): Project[] => {
    if (selectedManagerIds.length === 0) return allProjects;
    return allProjects.filter(
      (p) => p.projectManager && selectedManagerIds.includes(p.projectManager.id),
    );
  }, [allProjects, selectedManagerIds]);

  const tableData = filteredData(filteredByManager);

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-red-600">
        Fout bij laden van projecten
      </div>
    );
  }

  return (
    <>
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
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Projecten</h1>
            {hasWrite && (
              <ActionMenu
                secondaryActions={[
                  {
                    label: 'Nieuw project',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                    onClick: () => setShowCreate(true),
                  },
                ]}
              />
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <Input
                placeholder="Zoek projecten..."
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
            <div className="ml-auto">
              <ProjectManagerFilter
                managers={projectManagers}
                selectedIds={selectedManagerIds}
                onChange={setSelectedManagerIds}
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <Table
              columns={activeColumns}
              data={tableData}
              keyExtractor={(row) => row.id}
              emptyMessage="Geen projecten gevonden"
              sort={sort}
              onSort={toggleSort}
            />
          )}

          {/* Pagination */}
          {data && data.total > data.limit && (
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-500">
                {data.total} projecten totaal
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Vorige
                </Button>
                <span className="flex items-center px-3 text-sm text-gray-700">
                  Pagina {data.page} van {Math.ceil(data.total / data.limit)}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(data.total / data.limit)}
                >
                  Volgende
                </Button>
              </div>
            </div>
          )}
        </div>
      </DetailPageLayout>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setShowCreate(false);
            navigate(`/projects/${project.id}`);
          }}
        />
      )}
    </>
  );
}
