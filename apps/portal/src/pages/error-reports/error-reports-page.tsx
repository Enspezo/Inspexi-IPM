import { useState, useEffect } from 'react';
import type { ErrorReport, ErrorReportStatus } from '@/types';
import {
  Button,
  ErrorBox,
  Spinner,
  StatusBadge,
  Table,
  Select,
  Modal,
  useToast,
} from '@/components/ui';
import { ERROR_REPORT_STATUS } from '@/lib/status';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import {
  useErrorReports,
  useUpdateErrorReportStatus,
} from './hooks/use-error-reports';

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_BEHANDELING', label: 'In behandeling' },
  { value: 'OPGELOST', label: 'Opgelost' },
];

function ErrorReportDetailModal({
  report,
  onClose,
}: {
  report: ErrorReport;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const updateStatus = useUpdateErrorReportStatus();
  const [status, setStatus] = useState<ErrorReportStatus>(report.status);

  async function handleStatusChange(newStatus: string) {
    const s = newStatus as ErrorReportStatus;
    setStatus(s);
    try {
      await updateStatus.mutateAsync({ id: report.id, status: s });
      showToast('Status bijgewerkt', 'success');
    } catch {
      showToast('Status bijwerken mislukt', 'error');
      setStatus(report.status);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Foutmelding details">
      <div className="space-y-4">
        {/* Header info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-0.5">Datum</p>
            <p className="text-sm text-gray-900">
              {new Date(report.createdAt).toLocaleString('nl-NL')}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-0.5">Status</p>
            <Select
              options={statusFilterOptions.filter((o) => o.value !== '')}
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
            />
          </div>
          {report.organization && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">Organisatie</p>
              <p className="text-sm text-gray-900">{report.organization.name}</p>
            </div>
          )}
          {report.user && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">Gebruiker</p>
              <p className="text-sm text-gray-900">
                {report.user.firstName} {report.user.lastName}
              </p>
              <p className="text-xs text-gray-500">{report.user.email}</p>
            </div>
          )}
        </div>

        {/* Error message */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Foutmelding</p>
          <div className="rounded-lg bg-red-50 p-3">
            <p className="text-sm font-mono text-red-800 break-all">
              {report.errorMessage}
            </p>
          </div>
        </div>

        {/* User description */}
        {report.userDescription && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">
              Omschrijving gebruiker
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {report.userDescription}
            </p>
          </div>
        )}

        {/* Page URL */}
        {report.pageUrl && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Pagina</p>
            <p className="text-xs font-mono text-gray-600 break-all">
              {report.pageUrl}
            </p>
          </div>
        )}

        {/* Stack trace */}
        {report.stackTrace && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Stack trace</p>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
              {report.stackTrace}
            </pre>
          </div>
        )}

        {/* Component stack */}
        {report.componentStack && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">
              Component stack
            </p>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-36 whitespace-pre-wrap break-all">
              {report.componentStack}
            </pre>
          </div>
        )}

        {/* Browser info */}
        {report.userAgent && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Browser</p>
            <p className="text-xs font-mono text-gray-600 break-all">
              {report.userAgent}
            </p>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ErrorReportsPage() {
  const [statusFilter, setStatusFilter] = useState<ErrorReportStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null);

  const columns: ColumnDef<ErrorReport>[] = [
    {
      key: 'createdAt',
      header: 'Datum',
      pinned: true,
      sortable: true,
      sortKey: 'createdAt',
      render: (r) => (
        <button
          onClick={() => setSelectedReport(r)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline text-left"
        >
          {new Date(r.createdAt).toLocaleString('nl-NL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </button>
      ),
    },
    {
      key: 'organization',
      header: 'Organisatie',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (r) => r.organization?.name ?? '',
      render: (r) => (
        <span className="text-sm text-gray-700">
          {r.organization?.name ?? <span className="text-gray-400">—</span>}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Gebruiker',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (r) =>
        r.user ? `${r.user.firstName} ${r.user.lastName}` : '',
      render: (r) =>
        r.user ? (
          <div>
            <p className="text-sm text-gray-900">
              {r.user.firstName} {r.user.lastName}
            </p>
            <p className="text-xs text-gray-500">{r.user.email}</p>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'errorMessage',
      header: 'Foutmelding',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (r) => r.errorMessage,
      render: (r) => (
        <p
          className="text-sm text-gray-700 truncate max-w-xs cursor-pointer"
          title={r.errorMessage}
          onClick={() => setSelectedReport(r)}
        >
          {r.errorMessage}
        </p>
      ),
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
      getFilterValue: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} map={ERROR_REPORT_STATUS} />,
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
  } = useTableConfig({ pageKey: 'error-reports', columns });

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const { data, isLoading, error } = useErrorReports({
    status: (statusFilter as ErrorReportStatus) || undefined,
    page,
    limit: 20,
    sortBy: apiSort?.sortBy,
    sortOrder: apiSort?.sortOrder,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van foutmeldingen: {error.message}</ErrorBox>
    );
  }

  const reports = data?.data ?? [];
  const total = data?.total ?? 0;
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
            <h2 className="text-2xl font-bold text-gray-900">Foutmeldingen</h2>
            <p className="mt-1 text-sm text-gray-500">
              Overzicht van door gebruikers ingediende foutmeldingen
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-3">
          <div className="w-48">
            <Select
              options={statusFilterOptions}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as ErrorReportStatus | '');
                setPage(1);
              }}
            />
          </div>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(reports)}
          keyExtractor={(r) => r.id}
          emptyMessage="Geen foutmeldingen gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} {total !== 1 ? 'meldingen' : 'melding'} gevonden
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

      {selectedReport && (
        <ErrorReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </DetailPageLayout>
  );
}
