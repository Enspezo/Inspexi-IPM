import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role, TimesheetStatus } from '@/types';
import type { Timesheet } from '@/types';
import {
  Button,
  ErrorBox,
  Select,
  Spinner,
  StatusBadge,
  Table,
  useToast,
} from '@/components/ui';
import { TIMESHEET_STATUS } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { getErrorMessage } from '@/lib/api-client';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useUsers } from '@/pages/users/hooks/use-users';
import {
  exportTimeEntriesCsv,
  formatMinutes,
  useTimesheets,
} from './hooks/use-time-tracking';

const PAGE_SIZE = 20;

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: TimesheetStatus.CONCEPT, label: 'Concept' },
  { value: TimesheetStatus.INGEDIEND, label: 'Ingediend' },
  { value: TimesheetStatus.GOEDGEKEURD, label: 'Goedgekeurd' },
  { value: TimesheetStatus.AFGEWEZEN, label: 'Afgewezen' },
];

export default function TimesheetsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const { data: allUsers } = useUsers();
  const inspecteurs = (allUsers ?? []).filter((u) => u.roles.includes(Role.INSPECTEUR));

  const columns: ColumnDef<Timesheet>[] = [
    {
      key: 'week',
      header: 'Week',
      pinned: true,
      sortable: true,
      sortKey: 'weekNumber',
      render: (t) => (
        <button
          onClick={() => navigate(`/timesheets/${t.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          Week {t.weekNumber} — {t.year}
        </button>
      ),
    },
    {
      key: 'inspecteur',
      header: 'Inspecteur',
      groupable: true,
      getFilterValue: (t) => `${t.user?.firstName ?? ''} ${t.user?.lastName ?? ''}`.trim(),
      render: (t) => `${t.user?.firstName ?? ''} ${t.user?.lastName ?? ''}`.trim() || '—',
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      filterType: 'select',
      filterOptions: statusFilterOptions.filter((o) => o.value !== ''),
      groupable: true,
      sortable: true,
      sortKey: 'status',
      getFilterValue: (t) => t.status,
      render: (t) => <StatusBadge map={TIMESHEET_STATUS} status={t.status} />,
    },
    {
      key: 'totaal',
      header: 'Totaal',
      render: (t) => formatMinutes(t.totals?.totalMinutes ?? 0),
    },
    {
      key: 'ingediend',
      header: 'Ingediend op',
      sortable: true,
      sortKey: 'submittedAt',
      render: (t) => (t.submittedAt ? formatDate(t.submittedAt) : '—'),
    },
    {
      key: 'beoordeeldDoor',
      header: 'Beoordeeld door',
      render: (t) =>
        t.reviewedBy ? `${t.reviewedBy.firstName} ${t.reviewedBy.lastName}`.trim() : '—',
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
  } = useTableConfig({ pageKey: 'timesheets', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useTimesheets({
    status: (statusFilter as TimesheetStatus) || undefined,
    userId: userFilter || undefined,
    page,
    limit: PAGE_SIZE,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportTimeEntriesCsv({
        userId: userFilter || undefined,
        timesheetStatus: (statusFilter as TimesheetStatus) || undefined,
      });
    } catch (err) {
      showToast(getErrorMessage(err, 'Export mislukt'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorBox>Fout bij het laden van weekstaten: {error.message}</ErrorBox>;
  }

  const timesheets = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

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
          title="Uren"
          description="Weekstaten van inspecteurs beoordelen en exporteren"
          actions={
            <Button variant="secondary" onClick={handleExport} isLoading={isExporting}>
              Exporteer CSV
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="w-56">
            <Select
              options={[
                { value: '', label: 'Alle inspecteurs' },
                ...inspecteurs.map((u) => ({
                  value: u.id,
                  label: `${u.firstName} ${u.lastName}`.trim(),
                })),
              ]}
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setPage(1);
              }}
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
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(timesheets)}
          keyExtractor={(t) => t.id}
          emptyMessage="Geen weekstaten gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} {total !== 1 ? 'weekstaten' : 'weekstaat'} gevonden
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
    </DetailPageLayout>
  );
}
