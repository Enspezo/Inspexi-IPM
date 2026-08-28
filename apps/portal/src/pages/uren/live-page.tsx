import { useEffect, useState } from 'react';
import type { ActiveTimer } from '@/types';
import { Button, Card, ErrorBox, Spinner, StatusBadge } from '@/components/ui';
import { TIME_ACTIVITY } from '@/lib/status';
import { PageHeader } from '@/components/layout/page-header';
import { useActiveTimers } from './hooks/use-time-tracking';
import { InspectorMapModal } from './components/inspector-map-modal';

function elapsedLabel(startedAt: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

/**
 * "Nu actief" (PRD-16 §6.4): welke activiteit voert elke inspecteur nu uit —
 * en bij een lopende reistimer mét actieve tracker één klik naar de kaart.
 * Ververst elke 30 seconden.
 */
export default function LivePage() {
  const { data: timers, isLoading, error, refetch, isFetching, dataUpdatedAt } = useActiveTimers();
  const [mapUser, setMapUser] = useState<ActiveTimer | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error) {
    return <ErrorBox>Fout bij het laden van lopende timers: {error.message}</ErrorBox>;
  }

  const rows = timers ?? [];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Nu actief"
        description="Lopende timers per inspecteur; bij een reistimer met actieve tracker is de locatie te bekijken"
        actions={
          <Button variant="secondary" onClick={() => refetch()} isLoading={isFetching}>
            Vernieuwen
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">Er lopen op dit moment geen timers.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {rows.map((timer) => (
              <li key={timer.entryId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{timer.userName}</p>
                  <p className="truncate text-xs text-gray-500">
                    {timer.projectNumber
                      ? `${timer.projectNumber} — ${timer.projectTitle}`
                      : (timer.inspectionPlanName ?? '—')}
                    {timer.notes && ` · ${timer.notes}`}
                  </p>
                </div>
                <StatusBadge map={TIME_ACTIVITY} status={timer.activityType} />
                <span className="w-16 shrink-0 text-right text-sm tabular-nums text-gray-600">
                  {elapsedLabel(timer.startedAt, nowMs)}
                </span>
                {timer.hasLiveLocation ? (
                  <Button variant="secondary" size="sm" onClick={() => setMapUser(timer)}>
                    <svg
                      className="mr-1.5 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Toon op kaart
                  </Button>
                ) : (
                  <span className="w-28 shrink-0" />
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            Laatst bijgewerkt: {new Date(dataUpdatedAt).toLocaleTimeString('nl-NL')} · ververst
            automatisch elke 30 seconden
          </p>
        </Card>
      )}

      {mapUser && (
        <InspectorMapModal
          userId={mapUser.userId}
          userName={mapUser.userName}
          isOpen={!!mapUser}
          onClose={() => setMapUser(null)}
        />
      )}
    </div>
  );
}
