import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationType } from '@/types';
import type { Notification } from '@/types';
import { Button, Spinner, Table, Select, type Column } from '@/components/ui';
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  useUnreadCount,
} from './hooks/use-notifications';

const typeLabels: Record<string, string> = {
  [NotificationType.OFFERTE_TER_GOEDKEURING]: 'Offerte ter goedkeuring',
  [NotificationType.OFFERTE_GOEDGEKEURD]: 'Offerte goedgekeurd',
  [NotificationType.OFFERTE_AFGEWEZEN]: 'Offerte afgewezen',
  [NotificationType.OFFERTE_VERSTUURD]: 'Offerte verstuurd',
  [NotificationType.OFFERTE_BEKEKEN]: 'Offerte bekeken',
  [NotificationType.OFFERTE_ONDERTEKEND]: 'Offerte ondertekend',
  [NotificationType.OFFERTE_VERLOPEN]: 'Offerte verlopen',
  [NotificationType.NIEUWE_VRAAG_KLANT]: 'Nieuwe vraag klant',
  [NotificationType.ANTWOORD_OP_VRAAG]: 'Antwoord op vraag',
  [NotificationType.AANVRAAG_TOEGEWEZEN]: 'Aanvraag toegewezen',
  [NotificationType.AANVRAAG_STATUS_GEWIJZIGD]: 'Aanvraag status gewijzigd',
};

const typeFilterOptions = [
  { value: '', label: 'Alle types' },
  ...Object.values(NotificationType).map((t) => ({
    value: t,
    label: typeLabels[t] || t,
  })),
];

const readFilterOptions = [
  { value: '', label: 'Alle notificaties' },
  { value: 'true', label: 'Alleen ongelezen' },
];

function getEntityRoute(notif: Notification): string | null {
  if (!notif.entityType || !notif.entityId) return null;
  if (notif.entityType === 'quote') return `/quotes/${notif.entityId}`;
  if (notif.entityType === 'request') return `/requests/${notif.entityId}`;
  return null;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState('');
  const [unreadFilter, setUnreadFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: unreadData } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const { data, isLoading, error } = useNotifications({
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
      const route = getEntityRoute(notif);
      if (route) navigate(route);
    },
    [markRead, navigate],
  );

  const columns: Column<Notification>[] = [
    {
      key: 'status',
      header: '',
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
      render: (notif) => (
        <span className="text-xs text-gray-500">
          {typeLabels[notif.type] || notif.type}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Titel',
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
        Fout bij het laden van notificaties: {error.message}
      </div>
    );
  }

  const notifications = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notificaties</h2>
          <p className="mt-1 text-sm text-gray-500">
            Bekijk en beheer uw notificaties
          </p>
        </div>
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
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
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
        columns={columns}
        data={notifications}
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
  );
}
