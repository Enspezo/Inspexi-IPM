/**
 * Server-side NL date formatting with an explicit time zone.
 *
 * `Date#toLocaleDateString('nl-NL')` without a `timeZone` option formats in the
 * *process* time zone — UTC in a container — so a 23:30 appointment shows up as
 * the next day in emails, PDFs and notifications. Every human-readable date the
 * API renders must go through these helpers (or pass a time zone explicitly).
 */

/** Fallback time zone when the organization has none configured. */
export const DEFAULT_TIME_ZONE = 'Europe/Amsterdam';

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "8 juni 2026" */
export function formatDateNl(value: DateInput, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toDate(value));
}

/** "maandag 8 juni 2026" */
export function formatWeekdayDateNl(
  value: DateInput,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toDate(value));
}

/** "14:30" */
export function formatTimeNl(value: DateInput, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(value));
}

/** "8 juni 2026, 14:30" */
export function formatDateTimeNl(
  value: DateInput,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return `${formatDateNl(value, timeZone)}, ${formatTimeNl(value, timeZone)}`;
}

/** "08-06-2026" */
export function formatShortDateNl(
  value: DateInput,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(value));
}

/** "08-06-2026, 14:30" */
export function formatShortDateTimeNl(
  value: DateInput,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return `${formatShortDateNl(value, timeZone)}, ${formatTimeNl(value, timeZone)}`;
}
