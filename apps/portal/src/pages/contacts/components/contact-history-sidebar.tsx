import { useState } from 'react';
import { StatusBadge } from '@/components/ui';
import { formatShortDate } from '@/lib/format';
import { LOG_TYPE } from '@/lib/status';
import type { Contact, ContactEmail, ContactLog } from '@/types';

export function ContactHistorySidebar({
  contact,
  timeline,
  userCanWrite,
  onLogOpen,
  onEmailOpen,
}: {
  contact: Contact;
  timeline: Array<
    | (ContactLog & { _kind: 'log' })
    | (ContactEmail & { _kind: 'email' })
  >;
  userCanWrite: boolean;
  onLogOpen: () => void;
  onEmailOpen: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const MAX_ITEMS = 5;
  const visibleTimeline = showAll ? timeline : timeline.slice(0, MAX_ITEMS);

  return (
    <div className="space-y-3">
      {timeline.length === 0 ? (
        <p className="text-xs text-gray-400">Nog geen contactgeschiedenis</p>
      ) : (
        <div className="space-y-2">
          {visibleTimeline.map((item) => {
            if (item._kind === 'log') {
              return (
                <div
                  key={`log-${item.id}`}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <StatusBadge status={item.type} map={LOG_TYPE} />
                    <span className="text-xs text-gray-400">
                      {formatShortDate(item.loggedAt)}
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
              );
            }

            return (
              <div
                key={`email-${item.id}`}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                    E-mail
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatShortDate(item.sentAt)}
                  </span>
                </div>
                <p className="text-xs font-medium text-gray-900">{item.subject}</p>
                {item.bodyHtml && (
                  <p
                    className="mt-0.5 line-clamp-2 text-xs text-gray-600"
                    title={item.bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                  >
                    {item.bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                  </p>
                )}
                {item.user && (
                  <p className="mt-1 text-xs text-gray-400">
                    {item.user.firstName} {item.user.lastName}
                  </p>
                )}
              </div>
            );
          })}

          {timeline.length > MAX_ITEMS && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full py-1 text-center text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              {showAll
                ? 'Minder tonen'
                : `Alle ${timeline.length} items tonen`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
