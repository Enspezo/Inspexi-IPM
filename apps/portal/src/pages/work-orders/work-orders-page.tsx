import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkOrderStatus, Role } from '@/types';
import type { WorkOrder } from '@/types';
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
import { WORK_ORDER_STATUS } from '@/lib/status';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import { useAuth } from '@/providers/auth-provider';
import { useWorkOrders } from './hooks/use-work-orders';
import { CreateWorkOrderModal } from './components/create-work-order-modal';

const statusFilterOptions = [
  { value: '', label: 'Alle statussen' },
  { value: WorkOrderStatus.IN_VOORBEREIDING, label: 'In voorbereiding' },
  { value: WorkOrderStatus.IN_UITVOERING, label: 'In uitvoering' },
  { value: WorkOrderStatus.UITGEVOERD, label: 'Uitgevoerd' },
  { value: WorkOrderStatus.WACHT_OP_KLANT, label: 'Wacht op klant' },
];

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

export default function WorkOrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userCanWrite = user && user.roles.some((r) => canWrite.includes(r));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyMine, setOnlyMine] = useState(
    () => localStorage.getItem('inspexi:filter-mine:work-orders') === 'true',
  );
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, error } = useWorkOrders({
    search: search || undefined,
    status: (statusFilter as WorkOrderStatus) || undefined,
    inspectorId: onlyMine ? user?.id : undefined,
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

  const columns: ColumnDef<WorkOrder>[] = [
    {
      key: 'workOrderNumber',
      header: 'Werkbonnummer',
      pinned: true,
      sortable: true,
      render: (wo) => (
        <button
          onClick={() => navigate(`/work-orders/${wo.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {wo.workOrderNumber}
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
      sortable: true,
      getFilterValue: (wo) => wo.status,
      render: (wo) => <StatusBadge status={wo.status} map={WORK_ORDER_STATUS} />,
    },
    {
      key: 'product',
      header: 'Product',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (wo) => wo.planningItem?.productName ?? '',
      render: (wo) => (
        <span className="text-gray-700">
          {wo.planningItem?.productName ?? '—'}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (wo) => {
        const c = wo.planningItem?.contact;
        if (!c) return '';
        return c.companyName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
      },
      render: (wo) => {
        const c = wo.planningItem?.contact;
        if (!c) return <span className="text-gray-400">—</span>;
        const name = c.companyName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
        return <span className="text-gray-700">{name || '—'}</span>;
      },
    },
    {
      key: 'location',
      header: 'Locatie',
      filterable: true,
      filterType: 'text',
      sortable: true,
      getFilterValue: (wo) => {
        const l = wo.planningItem?.location;
        if (!l) return '';
        return [l.street, l.houseNumber, l.city].filter(Boolean).join(' ');
      },
      render: (wo) => {
        const l = wo.planningItem?.location;
        if (!l) return <span className="text-gray-400">—</span>;
        const addr = [l.street, l.houseNumber, l.city].filter(Boolean).join(' ');
        return <span className="text-gray-500 text-sm">{addr || '—'}</span>;
      },
    },
    {
      key: 'startTime',
      header: 'Starttijd',
      filterable: true,
      filterType: 'date',
      sortable: true,
      getFilterValue: (wo) => wo.startTime,
      render: (wo) =>
        wo.startTime ? (
          <span className="text-gray-500 text-xs">
            {new Date(wo.startTime).toLocaleString('nl-NL', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'endTime',
      header: 'Eindtijd',
      filterable: true,
      filterType: 'date',
      sortable: true,
      defaultVisible: false,
      getFilterValue: (wo) => wo.endTime,
      render: (wo) =>
        wo.endTime ? (
          <span className="text-gray-500 text-xs">
            {new Date(wo.endTime).toLocaleString('nl-NL', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Aangemaakt',
      filterable: true,
      filterType: 'date',
      sortable: true,
      getFilterValue: (wo) => wo.createdAt,
      render: (wo) => (
        <span className="text-gray-500 text-xs">
          {new Date(wo.createdAt).toLocaleDateString('nl-NL')}
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
  } = useTableConfig({ pageKey: 'work-orders', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van werkbonnen: {error.message}</ErrorBox>
    );
  }

  const workOrders = data?.data || [];
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
        <PageHeader
          title="Werkbonnen"
          description="Beheer en volg werkbonnen op"
          actions={
            userCanWrite && (
              <ActionMenu
                secondaryActions={[
                  {
                    label: 'Werkbon aanmaken',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                    onClick: () => setShowCreateModal(true),
                  },
                ]}
              />
            )
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Zoeken op werkbonnummer, product, relatie..."
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
                localStorage.setItem(
                  'inspexi:filter-mine:work-orders',
                  String(e.target.checked),
                );
                setPage(1);
              }}
            />
            <span className="text-gray-700">Mijn werkbonnen</span>
          </label>
        </div>

        <Table
          columns={activeColumns}
          data={filteredData(workOrders)}
          keyExtractor={(wo) => wo.id}
          emptyMessage="Geen werkbonnen gevonden"
          sort={sort}
          onSort={toggleSort}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} {total !== 1 ? 'werkbonnen' : 'werkbon'} gevonden
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

      <CreateWorkOrderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(id) => navigate(`/work-orders/${id}`)}
      />
    </DetailPageLayout>
  );
}
