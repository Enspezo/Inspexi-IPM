import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ActiveTimer } from '@/types';
import { Card, StatusBadge } from '@/components/ui';
import { TIME_ACTIVITY } from '@/lib/status';
import { useActiveTimers } from '../hooks/use-time-tracking';
import { InspectorMapModal } from './inspector-map-modal';

const MAX_ROWS = 5;

/**
 * Compacte "Nu actief"-kaart voor het dashboard (PRD-16 fase 4): wie draait
 * er nu een timer, met één klik naar de kaart bij een reizende inspecteur.
 * Alleen renderen mét URENREGISTRATIE + een plannende rol (de aanroeper gate't).
 */
export function ActiveTimersWidget() {
  const { data: timers } = useActiveTimers();
  const [mapUser, setMapUser] = useState<ActiveTimer | null>(null);
  const rows = timers ?? [];

  return (
    <Card
      title="Nu actief"
      actions={
        <Link to="/time-tracking/live" className="text-sm text-primary-600 hover:underline">
          Alles bekijken
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Er lopen op dit moment geen timers.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.slice(0, MAX_ROWS).map((timer) => (
            <li key={timer.entryId} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                {timer.userName}
                <span className="text-gray-500">
                  {timer.projectNumber ? ` · ${timer.projectNumber}` : ''}
                </span>
              </span>
              <StatusBadge map={TIME_ACTIVITY} status={timer.activityType} />
              {timer.hasLiveLocation && (
                <button
                  onClick={() => setMapUser(timer)}
                  className="text-sm text-primary-600 hover:underline"
                >
                  Kaart
                </button>
              )}
            </li>
          ))}
          {rows.length > MAX_ROWS && (
            <li className="pt-2 text-xs text-gray-500">
              +{rows.length - MAX_ROWS} meer —{' '}
              <Link to="/time-tracking/live" className="text-primary-600 hover:underline">
                bekijk alles
              </Link>
            </li>
          )}
        </ul>
      )}

      {mapUser && (
        <InspectorMapModal
          userId={mapUser.userId}
          userName={mapUser.userName}
          isOpen={!!mapUser}
          onClose={() => setMapUser(null)}
        />
      )}
    </Card>
  );
}
