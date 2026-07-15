import { useState } from 'react';
import { useAuditLog } from '@/hooks/use-audit-log';
import { AuditAction } from '@/types';
import type { AuditLogEntry } from '@/types';
import { getFieldLabel } from '@/lib/audit-field-labels';
import { formatAuditValue, isHiddenAuditField } from '@/lib/audit-value-format';
import { Button, Spinner } from '@/components/ui';

const ITEMS_PER_PAGE = 10;

const actionLabels: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'Aangemaakt',
  [AuditAction.UPDATE]: 'Bijgewerkt',
  [AuditAction.DELETE]: 'Verwijderd',
};

const actionBadgeClasses: Record<AuditAction, string> = {
  [AuditAction.CREATE]:
    'bg-green-100 text-green-800',
  [AuditAction.UPDATE]:
    'bg-blue-100 text-blue-800',
  [AuditAction.DELETE]:
    'bg-red-100 text-red-800',
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Zojuist';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min geleden`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`;

  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getUserDisplayName(entry: AuditLogEntry): string {
  return `${entry.user.firstName} ${entry.user.lastName}`;
}

function renderChangesSummary(entry: AuditLogEntry, entityType: string) {
  if (entry.action === AuditAction.CREATE) {
    return <p className="text-sm text-gray-600">Record aangemaakt</p>;
  }

  if (entry.action === AuditAction.DELETE) {
    return <p className="text-sm text-gray-600">Record verwijderd</p>;
  }

  if (!entry.changes) {
    return <p className="text-sm text-gray-600">Gegevens bijgewerkt</p>;
  }

  // Filter out internal/hidden fields
  const visibleEntries = Object.entries(entry.changes).filter(
    ([field]) => !isHiddenAuditField(field),
  );

  if (visibleEntries.length === 0) {
    return <p className="text-sm text-gray-600">Gegevens bijgewerkt</p>;
  }

  return (
    <ul className="space-y-1">
      {visibleEntries.slice(0, 5).map(([field, change]) => (
        <li key={field} className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">
            {getFieldLabel(entityType, field)}
          </span>{' '}
          gewijzigd van{' '}
          <span className="rounded bg-red-50 px-1 text-red-700">
            {formatAuditValue(change.from, field)}
          </span>{' '}
          naar{' '}
          <span className="rounded bg-green-50 px-1 text-green-700">
            {formatAuditValue(change.to, field)}
          </span>
        </li>
      ))}
      {visibleEntries.length > 5 && (
        <li className="text-xs text-gray-400">
          en {visibleEntries.length - 5} andere wijziging{visibleEntries.length - 5 !== 1 ? 'en' : ''}
        </li>
      )}
    </ul>
  );
}

interface AuditHistoryProps {
  entityType: string;
  entityId: string | undefined;
}

export function AuditHistory({ entityType, entityId }: AuditHistoryProps) {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useAuditLog(entityType, entityId, {
    page,
    limit: ITEMS_PER_PAGE,
  });

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      )}

      {error && (
        <p className="text-xs text-danger-600">
          Fout bij laden geschiedenis
        </p>
      )}

      {data && data.data.length === 0 && (
        <p className="text-xs text-gray-400">Geen geschiedenis beschikbaar</p>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="space-y-3">
            {data.data.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionBadgeClasses[entry.action]}`}
                  >
                    {actionLabels[entry.action]}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </div>

                <div className="mb-2">
                  {renderChangesSummary(entry, entityType)}
                </div>

                <p className="text-xs text-gray-400">
                  Door {getUserDisplayName(entry)}
                  {entry.source === 'AI' && (
                    <span
                      className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary-50 px-1 py-0.5 text-[10px] font-medium text-primary-700 align-middle"
                      title="Uitgevoerd via de AI-assistent"
                    >
                      <svg
                        className="h-2.5 w-2.5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M10 1.5l1.9 4.3 4.6.4-3.5 3 1.1 4.5L10 15.9 5.9 13.7 7 9.2 3.5 6.2l4.6-.4L10 1.5z" />
                      </svg>
                      AI
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.total > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Vorige
              </Button>
              <span className="text-xs text-gray-500">
                {page} / {Math.ceil(data.total / ITEMS_PER_PAGE)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPage((p) =>
                    Math.min(Math.ceil(data.total / ITEMS_PER_PAGE), p + 1),
                  )
                }
                disabled={
                  page >= Math.ceil(data.total / ITEMS_PER_PAGE)
                }
              >
                Volgende
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
