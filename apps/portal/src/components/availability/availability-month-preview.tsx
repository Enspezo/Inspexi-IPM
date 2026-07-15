import { useMemo, useState } from 'react';
import { Spinner } from '@/components/ui';
import { AvailabilityExceptionType } from '@/types';
import type { ResolvedAvailabilityDay } from '@/types';
import { useResolvedAvailability } from '@/pages/availability/hooks/use-availability';
import { formatInterval } from './format-availability';

const MONTHS_NL = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];
const DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

/** Lokale Y/M/D → 'YYYY-MM-DD' (matcht de kalenderdag-labels, geen tz-shift). */
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

interface AvailabilityMonthPreviewProps {
  userId: string;
  /** Alleen laden wanneer de kijker resolved availability mag lezen (planners/management). */
  enabled?: boolean;
}

/**
 * Compacte maandweergave van de resolved availability (PRD-12 §12.8b.4):
 * groen = beschikbaar (met tijdintervallen), grijs = niet beschikbaar,
 * rood accent = expliciet geblokkeerd (bron EXCEPTION/GEBLOKKEERD).
 */
export function AvailabilityMonthPreview({ userId, enabled = true }: AvailabilityMonthPreviewProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const gridStart = getMonday(new Date(year, month, 1));
  const gridDays = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart],
  );

  const fromKey = toDateKey(gridDays[0]);
  const toKey = toDateKey(gridDays[41]);

  const { data, isLoading, error } = useResolvedAvailability(fromKey, toKey, [userId], { enabled });

  const byDate = useMemo(() => {
    const map = new Map<string, ResolvedAvailabilityDay>();
    for (const d of data ?? []) map.set(d.date, d);
    return map;
  }, [data]);

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const todayKey = toDateKey(new Date());

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-900">
          {MONTHS_NL[month]} {year}
        </h4>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToday}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            Vandaag
          </button>
          <button
            type="button"
            onClick={goPrev}
            title="Vorige maand"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            title="Volgende maand"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {!enabled ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">
          De kalenderweergave is beschikbaar voor planners en beheerders.
        </p>
      ) : error ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">
          Kon de beschikbaarheid niet laden.
        </p>
      ) : (
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Spinner />
            </div>
          )}

          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
            {DAYS_SHORT.map((d) => (
              <div key={d} className="py-1.5 text-center text-[11px] font-semibold uppercase text-gray-500">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {gridDays.map((day, idx) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === month;
              const isToday = key === todayKey;
              const resolved = byDate.get(key);
              const available = resolved?.isAvailable ?? false;
              const blocked =
                !available &&
                (resolved?.sources ?? []).some(
                  (s) => s.kind === 'EXCEPTION' && s.type === AvailabilityExceptionType.GEBLOKKEERD,
                );

              const cellTone = available
                ? 'bg-green-50'
                : blocked
                ? 'bg-red-50'
                : 'bg-white';

              return (
                <div
                  key={idx}
                  className={`min-h-[64px] border-b border-r border-gray-100 p-1 ${cellTone} ${
                    !inMonth ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                        isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {blocked && (
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" title="Geblokkeerd" />
                    )}
                  </div>
                  {available && resolved && (
                    <div className="mt-0.5 space-y-0.5">
                      {resolved.intervals.slice(0, 2).map((iv, i) => (
                        <div
                          key={i}
                          className="truncate rounded bg-green-100 px-1 text-[10px] font-medium text-green-800"
                          title={formatInterval(iv)}
                        >
                          {formatInterval(iv)}
                        </div>
                      ))}
                      {resolved.intervals.length > 2 && (
                        <div className="px-1 text-[10px] text-gray-500">
                          +{resolved.intervals.length - 2}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-4 px-4 py-2 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm bg-green-100" /> Beschikbaar
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm bg-gray-100" /> Niet beschikbaar
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm bg-red-100" /> Geblokkeerd
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
