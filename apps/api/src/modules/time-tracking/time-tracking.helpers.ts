/**
 * DI-vrije helpers voor de urenregistratie (PRD-16).
 *
 * Weekstaten zijn ISO-weken (ma–zo). De week van een urenregel wordt bepaald
 * door de *lokale* datum van `startedAt` in de org-tijdzone — een timer die op
 * zondagavond 23:30 start hoort bij die week, ook al is het in UTC al maandag.
 */

export interface IsoWeek {
  /** ISO-weekjaar — kan rond de jaarwissel afwijken van het kalenderjaar. */
  year: number;
  /** ISO-weeknummer 1..53. */
  week: number;
}

const DAY_MS = 86_400_000;

/** Lokale kalenderdatum (Y/M/D) van een timestamp in de gegeven tijdzone. */
function localDateParts(date: Date, timeZone: string): [number, number, number] {
  // en-CA → "YYYY-MM-DD"
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [y, m, d] = formatted.split('-').map(Number);
  return [y, m, d];
}

/** ISO-weeknummer + ISO-weekjaar van een timestamp in de org-tijdzone. */
export function isoWeekOf(date: Date, timeZone = 'Europe/Amsterdam'): IsoWeek {
  const [y, m, d] = localDateParts(date, timeZone);
  // Standaard ISO-8601-algoritme op UTC-middernacht van de lokale datum:
  // verschuif naar de donderdag van de week; diens jaar is het ISO-weekjaar.
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (dt.getUTCDay() + 6) % 7; // 0 = maandag
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const isoYear = dt.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week = 1 + Math.round((dt.getTime() - jan4.getTime()) / DAY_MS / 7 - (3 - jan4DayNum) / 7);
  return { year: isoYear, week };
}

/** Duur in hele minuten tussen twee timestamps (afgerond, nooit negatief). */
export function durationMinutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/** Datum als "d maand yyyy" (nl-NL) in de org-tijdzone — voor taak-/notificatieteksten. */
export function formatDateNl(date: Date, timeZone = 'Europe/Amsterdam'): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Duur als "1u 25m" voor taak-/notificatieteksten. */
export function formatDurationNl(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}u` : `${h}u ${m}m`;
}

/** Offset (ms) van een tijdzone t.o.v. UTC op het gegeven moment. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl kan "24" teruggeven voor middernacht (hourCycle h24-gedrag)
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/**
 * 23:59:00 lokale tijd van de kalenderdag van `date` (org-tijdzone), als UTC-Date.
 * Gebruikt door de nachtwaker (PRD-16 §4.3): een vergeten timer wordt server-side
 * op dit moment afgekapt.
 */
export function localDayEndUtc(date: Date, timeZone = 'Europe/Amsterdam'): Date {
  const [y, m, d] = localDateParts(date, timeZone);
  // Eerste gok: alsof lokaal = UTC; corrigeer daarna met de werkelijke offset
  // op dat moment (tweede pass vangt een DST-overgang rond middernacht af).
  let guess = Date.UTC(y, m - 1, d, 23, 59, 0);
  guess -= tzOffsetMs(new Date(guess), timeZone);
  guess = Date.UTC(y, m - 1, d, 23, 59, 0) - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Zijn twee timestamps op dezelfde lokale kalenderdag (org-tijdzone)? */
export function isSameLocalDay(a: Date, b: Date, timeZone = 'Europe/Amsterdam'): boolean {
  const [ay, am, ad] = localDateParts(a, timeZone);
  const [by, bm, bd] = localDateParts(b, timeZone);
  return ay === by && am === bm && ad === bd;
}
