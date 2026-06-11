import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { Card, Spinner, Button, StatusBadge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { AUDIT_ACTION } from '@/lib/status';
import { useMyActivity } from '@/hooks/use-my-activity';
import { AuditAction } from '@/types';
import type { AuditLogEntry } from '@/types';
import {
  ENTITY_TYPE_LABELS,
  getEntityTypeLabel,
  getEntityLink,
  getEntityDisplayName,
} from '@/lib/audit-entity-helpers';
import { getFieldLabel } from '@/lib/audit-field-labels';
import { formatAuditValue, isHiddenAuditField } from '@/lib/audit-value-format';

const ITEMS_PER_PAGE = 20;

const actionBadgeClasses: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'bg-green-100 text-green-800',
  [AuditAction.UPDATE]: 'bg-blue-100 text-blue-800',
  [AuditAction.DELETE]: 'bg-red-100 text-red-800',
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`;
  return formatDateTime(dateStr);
}

function ChangesSummary({ entry }: { entry: AuditLogEntry }) {
  if (entry.action === AuditAction.CREATE) {
    return <p className="text-sm text-gray-500">Record aangemaakt</p>;
  }

  if (entry.action === AuditAction.DELETE) {
    return <p className="text-sm text-gray-500">Record verwijderd</p>;
  }

  if (!entry.changes) {
    return <p className="text-sm text-gray-500">Gegevens bijgewerkt</p>;
  }

  const visibleEntries = Object.entries(entry.changes).filter(
    ([field]) => !isHiddenAuditField(field),
  );

  if (visibleEntries.length === 0) {
    return <p className="text-sm text-gray-500">Gegevens bijgewerkt</p>;
  }

  return (
    <ul className="space-y-0.5">
      {visibleEntries.slice(0, 3).map(([field, change]) => (
        <li key={field} className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">
            {getFieldLabel(entry.entityType, field)}
          </span>{' '}
          gewijzigd van{' '}
          <span className="rounded bg-red-50 px-1 text-xs text-red-700">
            {formatAuditValue(change.from, field)}
          </span>{' '}
          naar{' '}
          <span className="rounded bg-green-50 px-1 text-xs text-green-700">
            {formatAuditValue(change.to, field)}
          </span>
        </li>
      ))}
      {visibleEntries.length > 3 && (
        <li className="text-xs text-gray-400">
          en {visibleEntries.length - 3} andere{' '}
          {visibleEntries.length - 3 === 1 ? 'wijziging' : 'wijzigingen'}
        </li>
      )}
    </ul>
  );
}

function ActivityItem({ entry }: { entry: AuditLogEntry }) {
  const link = getEntityLink(entry.entityType, entry.entityId, entry.snapshot);
  const name = getEntityDisplayName(entry.entityType, entry.snapshot);
  const typeLabel = getEntityTypeLabel(entry.entityType);

  return (
    <div className="flex gap-4 py-4">
      {/* Timeline dot */}
      <div className="relative flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${actionBadgeClasses[entry.action]}`}
        >
          {entry.action === AuditAction.CREATE ? '+' : entry.action === AuditAction.DELETE ? '×' : '~'}
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.action} map={AUDIT_ACTION} />
            <span className="text-sm font-medium text-gray-900">{typeLabel}</span>
            {name !== typeLabel && (
              <>
                <span className="text-gray-400">&mdash;</span>
                {link ? (
                  <Link
                    to={link}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-600">{name}</span>
                )}
              </>
            )}
            {name === typeLabel && link && (
              <Link
                to={link}
                className="text-sm text-primary-600 hover:underline"
              >
                Bekijk record
              </Link>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <span className="text-xs font-medium text-gray-500">
              {formatRelativeTime(entry.createdAt)}
            </span>
            <span className="text-xs text-gray-400" title={formatDateTime(entry.createdAt)}>
              {formatDateTime(entry.createdAt)}
            </span>
          </div>
        </div>

        {/* Changes */}
        <div className="mt-1.5">
          <ChangesSummary entry={entry} />
        </div>
      </div>
    </div>
  );
}

const entityTypeOptions = [
  { value: '', label: 'Alle types' },
  ...Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const actionOptions = [
  { value: '', label: 'Alle acties' },
  { value: 'CREATE', label: 'Aangemaakt' },
  { value: 'UPDATE', label: 'Bijgewerkt' },
  { value: 'DELETE', label: 'Verwijderd' },
];

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, error } = useMyActivity({
    entityType: entityType || undefined,
    action: action || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: ITEMS_PER_PAGE,
  });

  const totalPages = data ? Math.ceil(data.total / ITEMS_PER_PAGE) : 0;

  function handleFilterChange() {
    setPage(1);
  }

  function resetFilters() {
    setEntityType('');
    setAction('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const hasActiveFilters = !!(entityType || action || dateFrom || dateTo);

  return (
    <DetailPageLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Activiteiten</h2>
            <p className="mt-1 text-sm text-gray-500">
              Overzicht van alle acties die u hebt uitgevoerd
              {data && (
                <span className="ml-1 text-gray-400">
                  ({data.total.toLocaleString('nl-NL')} {data.total === 1 ? 'resultaat' : 'resultaten'})
                </span>
              )}
            </p>
          </div>
          <Link
            to="/dashboard"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
        </div>

        {/* Filters */}
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            {/* Entity type filter */}
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Type
              </label>
              <select
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value);
                  handleFilterChange();
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                {entityTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action filter */}
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Actie
              </label>
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  handleFilterChange();
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                {actionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Datum vanaf
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  handleFilterChange();
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            {/* Date to */}
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Datum tot
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  handleFilterChange();
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            {/* Reset */}
            {hasActiveFilters && (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                Wissen
              </Button>
            )}
          </div>
        </Card>

        {/* Activity list */}
        <Card>
          {isLoading && (
            <div className="flex h-48 items-center justify-center">
              <Spinner size="md" />
            </div>
          )}

          {error && (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-red-600">Fout bij laden activiteiten</p>
            </div>
          )}

          {!isLoading && data && data.data.length === 0 && (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <svg
                  className="mx-auto mb-3 h-10 w-10 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-gray-500">
                  {hasActiveFilters
                    ? 'Geen activiteiten gevonden met deze filters'
                    : 'Nog geen activiteiten'}
                </p>
              </div>
            </div>
          )}

          {!isLoading && data && data.data.length > 0 && (
            <>
              <div className="divide-y divide-gray-100">
                {data.data.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-2">
                  <p className="text-sm text-gray-500">
                    Pagina {page} van {totalPages} &nbsp;&middot;&nbsp; {data.total.toLocaleString('nl-NL')} resultaten
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Vorige
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      Volgende
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </DetailPageLayout>
  );
}
