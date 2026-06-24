import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationType } from '@/types';
import type { Notification } from '@/types';
import { Button, ErrorBox, Spinner, Table, Select } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  TableConfigSidebar,
  useTableConfig,
  type ColumnDef,
} from '@/components/table-config';
import {
  NOTIFICATION_MODELS,
  getNotificationRoute,
  getTypeLabel,
  getTypesForModel,
  type NotificationModel,
} from '@/lib/notifications';
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  useUnreadCount,
} from './hooks/use-notifications';

const modelFilterOptions = [
  { value: '', label: 'Alle modellen' },
  ...NOTIFICATION_MODELS.map((m) => ({ value: m.key, label: m.label })),
];

const allTypeFilterOptions = Object.values(NotificationType).map((t) => ({
  value: t,
  label: getTypeLabel(t),
}));

const readFilterOptions = [
  { value: '', label: 'Alle notificaties' },
  { value: 'true', label: 'Alleen ongelezen' },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [modelFilter, setModelFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [unreadFilter, setUnreadFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: unreadData } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  // Type-opties hangen af van het gekozen model (cascade).
  const typeFilterOptions = [
    { value: '', label: 'Alle types' },
    ...(modelFilter
      ? getTypesForModel(modelFilter as NotificationModel).map((t) => ({
          value: t,
          label: getTypeLabel(t),
        }))
      : allTypeFilterOptions),
  ];

  const { data, isLoading, error } = useNotifications({
    model: (modelFilter as NotificationModel) || undefined,
    type: (typeFilter as NotificationType) || undefined,
    unread: unreadFilter === 'true' ? true : undefined,
    page,
    limit: 20,
  });

  const handleRowClick = useCallback(
    (notif: Notification) => {
      if (!notif.isRead) {
        markRead.mutate(notif.id);
      }
      const route = getNotificationRoute(notif);
      if (route) navigate(route);
    },
    [markRead, navigate],
  );

  const columns: ColumnDef<Notification>[] = [
    {
      key: 'status',
      header: '',
      pinned: true,
      sidebarLabel: 'Gelezen',
      render: (notif) => (
        <span className="flex justify-center">
          {!notif.isRead && (
            <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />
          )}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      filterable: true,
      filterType: 'select',
      filterOptions: allTypeFilterOptions,
      groupable: true,
      getFilterValue: (notif) => notif.type,
      render: (notif) => (
        <span className="text-xs text-gray-500">
          {getTypeLabel(notif.type)}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Titel',
      filterable: true,
      filterType: 'text',
      getFilterValue: (notif) => notif.title,
      render: (notif) => (
        <button
          onClick={() => handleRowClick(notif)}
          className={`text-left text-sm hover:underline ${
            !notif.isRead
              ? 'font-semibold text-gray-900'
              : 'text-gray-700'
          }`}
        >
          {notif.title}
        </button>
      ),
    },
    {
      key: 'body',
      header: 'Bericht',
      render: (notif) => (
        <span className="block max-w-xs truncate text-sm text-gray-500">
          {notif.body}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Datum',
      filterable: true,
      filterType: 'date',
      getFilterValue: (notif) => notif.createdAt,
      render: (notif) => (
        <span className="whitespace-nowrap text-xs text-gray-500">
          {new Date(notif.createdAt).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
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
  } = useTableConfig({ pageKey: 'notifications', columns });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>Fout bij het laden van notificaties: {error.message}</ErrorBox>
    );
  }

  const notifications = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const unreadCount = unreadData?.count ?? 0;

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
        title="Notificaties"
        description="Bekijk en beheer uw notificaties"
        actions={
          <Button
            variant="secondary"
            onClick={() => markAllRead.mutate()}
            disabled={unreadCount === 0}
            isLoading={markAllRead.isPending}
          >
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            Alles gelezen
          </Button>
        }
      />

      {/* Cascaderende filter: model → type */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-64">
          <Select
            options={modelFilterOptions}
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value);
              setTypeFilter(''); // reset type bij modelwissel
              setPage(1);
            }}
          />
        </div>
        <div className="w-64">
          <Select
            options={typeFilterOptions}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-48">
          <Select
            options={readFilterOptions}
            value={unreadFilter}
            onChange={(e) => {
              setUnreadFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Table
        columns={activeColumns}
        data={filteredData(notifications)}
        keyExtractor={(n) => n.id}
        emptyMessage="Geen notificaties gevonden"
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} notificatie{total !== 1 ? 's' : ''} gevonden
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
