import { useMemo } from 'react';
import { TimeActivityType } from '@/types';
import { Card, ErrorBox, Spinner, StatusBadge } from '@/components/ui';
import { TIME_ACTIVITY, TIMESHEET_STATUS, TIME_ACTIVITY_LABELS } from '@/lib/status';
import { formatShortDate } from '@/lib/format';
import {
  formatMinutes,
  useTimeEntries,
} from '@/pages/uren/hooks/use-time-tracking';

interface Props {
  projectId: string;
}

/**
 * Projectdetail-tab "Uren" (PRD-16): bestede uren per activiteit + per
 * inspecteur, met de onderliggende regels — voor nacalculatie. Toont alle
 * regels ongeacht weekstaat-status (de status-badge maakt het verschil).
 */
export function ProjectHoursTab({ projectId }: Props) {
  const { data, isLoading, error } = useTimeEntries({ projectId, limit: 200 });
  const entries = useMemo(
    () => (data?.data ?? []).filter((e) => e.endedAt !== null),
    [data?.data],
  );

  const totals = useMemo(() => {
    let total = 0;
    const byActivity = new Map<TimeActivityType, number>();
    const byUser = new Map<string, { name: string; minutes: number }>();
    for (const e of entries) {
      const minutes = e.durationMinutes ?? 0;
      total += minutes;
      byActivity.set(e.activityType, (byActivity.get(e.activityType) ?? 0) + minutes);
      const name = e.user ? `${e.user.firstName} ${e.user.lastName}`.trim() : '—';
      const existing = byUser.get(e.userId) ?? { name, minutes: 0 };
      byUser.set(e.userId, { name, minutes: existing.minutes + minutes });
    }
    return { total, byActivity, byUser };
  }, [entries]);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return <ErrorBox>Fout bij het laden van projecturen: {error.message}</ErrorBox>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Totalen</h3>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Totaal</dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">
              {formatMinutes(totals.total)}
            </dd>
          </div>
          {[...totals.byActivity.entries()].map(([activity, minutes]) => (
            <div key={activity}>
              <dt className="text-sm font-medium text-gray-500">
                {TIME_ACTIVITY_LABELS[activity] ?? activity}
              </dt>
              <dd className="mt-1 text-lg text-gray-900">{formatMinutes(minutes)}</dd>
            </div>
          ))}
        </div>
        {totals.byUser.size > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h4 className="mb-2 text-sm font-medium text-gray-500">Per inspecteur</h4>
            <ul className="space-y-1">
              {[...totals.byUser.values()].map((row) => (
                <li key={row.name} className="flex justify-between text-sm">
                  <span className="text-gray-700">{row.name}</span>
                  <span className="font-medium tabular-nums text-gray-900">
                    {formatMinutes(row.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Urenregels</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">Nog geen uren geschreven op dit project.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-sm text-gray-600">
                  {formatShortDate(entry.startedAt)}
                </span>
                <StatusBadge map={TIME_ACTIVITY} status={entry.activityType} />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                  {entry.user ? `${entry.user.firstName} ${entry.user.lastName}`.trim() : '—'}
                  {entry.notes && <span className="text-gray-500"> · {entry.notes}</span>}
                </span>
                {entry.timesheet && (
                  <StatusBadge map={TIMESHEET_STATUS} status={entry.timesheet.status} />
                )}
                <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">
                  {formatMinutes(entry.durationMinutes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
