import { useState } from 'react';
import type { ContactLog } from '@/types';
import { getStatusConfig, LOG_TYPE } from '@/lib/status';

// ─── ContactLogsSidebar ───────────────────────────────

export function ContactLogsSidebar({
  logs,
  userCanWrite,
  onLogOpen,
}: {
  logs: ContactLog[];
  userCanWrite: boolean;
  onLogOpen: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const MAX_ITEMS = 5;
  const sorted = [...logs].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );
  const visible = showAll ? sorted : sorted.slice(0, MAX_ITEMS);

  return (
    <div className="space-y-3">
      {userCanWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onLogOpen}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Contactmoment loggen
          </button>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-xs text-gray-400">Nog geen contactmomenten</p>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    getStatusConfig(LOG_TYPE, item.type).classes
                  }`}
                >
                  {getStatusConfig(LOG_TYPE, item.type).label}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(item.loggedAt).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {item.subject && (
                <p className="text-xs font-medium text-gray-900">{item.subject}</p>
              )}
              {item.body && (
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-600" title={item.body}>
                  {item.body}
                </p>
              )}
              {item.user && (
                <p className="mt-1 text-xs text-gray-400">
                  {item.user.firstName} {item.user.lastName}
                </p>
              )}
            </div>
          ))}

          {sorted.length > MAX_ITEMS && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full py-1 text-center text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              {showAll
                ? 'Minder tonen'
                : `Alle ${sorted.length} items tonen`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
