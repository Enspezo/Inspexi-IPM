/**
 * Pure formatteer-helpers voor de beschikbaarheid-UI (PRD-12 §12.8). Bewust
 * Prisma-/React-vrij zodat ze los te unit-testen zijn (Vitest).
 *
 * Conventie (spiegelt de backend-resolutie): tijden zijn minuten vanaf
 * middernacht; absolute instants (`startsAt`/`endsAt`) worden als UTC-wandkloktijd
 * geïnterpreteerd, zodat de getoonde datum/tijd deterministisch is, los van de
 * tijdzone van de client.
 */
import type { AvailabilityException, AvailabilityInterval } from '@/types';
import { AvailabilityExceptionType } from '@/types';

/** ISO-weekdag 1..7 → korte NL-afkorting (index 0 = maandag). */
export const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;
export const WEEKDAY_LONG = [
  'maandag',
  'dinsdag',
  'woensdag',
  'donderdag',
  'vrijdag',
  'zaterdag',
  'zondag',
] as const;

const MS_PER_DAY = 86_400_000;

/** Minuten vanaf middernacht → "HH:MM" (1440 → "24:00"). */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" → minuten vanaf middernacht (of null bij ongeldige invoer). */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}

/** "08:00–17:30" voor een tijdsinterval in minuten. */
export function formatTimeRange(startMinute: number, endMinute: number): string {
  return `${minutesToTime(startMinute)}–${minutesToTime(endMinute)}`;
}

export function formatInterval(interval: AvailabilityInterval): string {
  return formatTimeRange(interval.startMinute, interval.endMinute);
}

/** Korte weekdag-afkorting voor een ISO-weekdag (1..7). */
export function weekdayShort(iso: number): string {
  return WEEKDAY_SHORT[iso - 1] ?? String(iso);
}

/** Gesorteerde, unieke weekdagen → "ma, wo". */
export function formatWeekdays(weekdays: number[]): string {
  return [...new Set(weekdays)]
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b)
    .map(weekdayShort)
    .join(', ');
}

/** Som van alle slot-minuten (per week) → totaal minuten. */
export function computeWeeklyMinutes(
  slots: { startMinute: number; endMinute: number }[],
): number {
  return slots.reduce((sum, s) => sum + Math.max(0, s.endMinute - s.startMinute), 0);
}

/** Minuten → "40,0 uur" (nl-NL decimaal-komma, 1 decimaal). */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1).replace('.', ',')} uur`;
}

// ─── Datum-helpers (UTC-wandkloktijd) ────────────────────────────────────────

const dateFmtLong = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateFmtShort = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseUTC(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO/date-only → "8 juli 2026" (UTC-datum). */
export function formatDateLongUTC(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parseUTC(value);
  return d ? dateFmtLong.format(d) : '—';
}

/** ISO/date-only → "8 jul 2026" (UTC-datum). */
export function formatDateShortUTC(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parseUTC(value);
  return d ? dateFmtShort.format(d) : '—';
}

/** Tijd-deel van een ISO-instant als UTC-wandkloktijd → "09:00". */
export function timeFromISO(value: string | null | undefined): string {
  if (!value) return '';
  const d = parseUTC(value);
  if (!d) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" van een ISO-instant (UTC-datum). */
export function dateKeyFromISO(value: string | null | undefined): string {
  if (!value) return '';
  const d = parseUTC(value);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

// ─── Uitzondering: leesbare periode/patroon ──────────────────────────────────

/**
 * Menselijk-leesbare omschrijving van de periode/patroon van een uitzondering.
 * Eenmalig: "8 juli 2026 09:00–12:00" / "8 juli 2026 (hele dag)" /
 * "8 juli 2026 – 11 juli 2026 (hele dag)".
 * Herhalend: "Elke ma, wo 01:00–05:00" / "Elke 2 weken di, do (hele dag)",
 * met optioneel " vanaf …"/" t/m …".
 */
export function formatExceptionPeriod(
  exc: Pick<
    AvailabilityException,
    | 'isRecurring'
    | 'startsAt'
    | 'endsAt'
    | 'allDay'
    | 'weekdays'
    | 'startMinute'
    | 'endMinute'
    | 'intervalWeeks'
    | 'recurStartDate'
    | 'recurEndDate'
  >,
): string {
  if (exc.isRecurring) return formatRecurring(exc);
  return formatOneOff(exc);
}

function formatRecurring(
  exc: Pick<
    AvailabilityException,
    | 'allDay'
    | 'weekdays'
    | 'startMinute'
    | 'endMinute'
    | 'intervalWeeks'
    | 'recurStartDate'
    | 'recurEndDate'
  >,
): string {
  const interval = Math.max(1, exc.intervalWeeks || 1);
  const prefix = interval === 1 ? 'Elke' : `Elke ${interval} weken`;
  const days = formatWeekdays(exc.weekdays ?? []) || '—';
  const time =
    exc.allDay || exc.startMinute == null || exc.endMinute == null
      ? 'hele dag'
      : formatTimeRange(exc.startMinute, exc.endMinute);

  let out = `${prefix} ${days} ${time}`;
  if (exc.recurStartDate) out += ` vanaf ${formatDateShortUTC(exc.recurStartDate)}`;
  if (exc.recurEndDate) out += ` t/m ${formatDateShortUTC(exc.recurEndDate)}`;
  return out;
}

function formatOneOff(
  exc: Pick<AvailabilityException, 'startsAt' | 'endsAt' | 'allDay'>,
): string {
  if (!exc.startsAt || !exc.endsAt) return '—';

  const startKey = dateKeyFromISO(exc.startsAt);

  if (exc.allDay) {
    // `endsAt` is een exclusief einde → de laatste inclusieve dag is endsAt − 1 dag.
    const endDate = parseUTC(exc.endsAt);
    const inclusiveEnd = endDate ? new Date(endDate.getTime() - MS_PER_DAY) : null;
    const endKey = inclusiveEnd ? inclusiveEnd.toISOString().slice(0, 10) : startKey;
    if (endKey <= startKey) {
      return `${formatDateLongUTC(exc.startsAt)} (hele dag)`;
    }
    return `${formatDateLongUTC(exc.startsAt)} – ${formatDateLongUTC(inclusiveEnd!.toISOString())} (hele dag)`;
  }

  const endKey = dateKeyFromISO(exc.endsAt);
  const startTime = timeFromISO(exc.startsAt);
  const endTime = timeFromISO(exc.endsAt);
  if (startKey === endKey) {
    return `${formatDateLongUTC(exc.startsAt)} ${startTime}–${endTime}`;
  }
  return `${formatDateLongUTC(exc.startsAt)} ${startTime} – ${formatDateLongUTC(exc.endsAt)} ${endTime}`;
}
