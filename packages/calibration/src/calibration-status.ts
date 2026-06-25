/**
 * Afgeleide kalibratiestatus van een meetmiddel.
 *
 * Bewust GEEN enum/DB-kolom: de status wordt overal (API-sync, scheduler,
 * documentgeneratie, portal-badge, PWA) uit dezelfde bron berekend —
 * laatste kalibratiedatum + verloopdatum + drempel. Eén bron-van-waarheid.
 */
export type CalibrationStatus =
  | 'GEEN_KALIBRATIE'
  | 'GELDIG'
  | 'BINNENKORT'
  | 'VERLOPEN';

/** Standaard waarschuwingsdrempel (dagen) voor "verloopt binnenkort". */
export const DEFAULT_CALIBRATION_WARN_DAYS = 30;

export interface CalibrationDates {
  /** Datum van de laatste (meest recente) kalibratie. */
  lastCalibrationDate: Date | string | null | undefined;
  /** Afgeleide verloopdatum = laatste kalibratiedatum + interval. */
  nextCalibrationDue: Date | string | null | undefined;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Bepaalt de afgeleide kalibratiestatus:
 * - geen laatste kalibratie            → `GEEN_KALIBRATIE`
 * - verloopdatum verstreken            → `VERLOPEN`
 * - verloopdatum binnen `thresholdDays`→ `BINNENKORT`
 * - anders                             → `GELDIG`
 *
 * De dag-afronding is identiek aan `getCertificateValidityKey` in de portal,
 * zodat badges consistent zijn over de hele app.
 *
 * @param now referentiemoment (injecteerbaar voor deterministische tests).
 */
export function computeCalibrationStatus(
  dates: CalibrationDates,
  thresholdDays: number = DEFAULT_CALIBRATION_WARN_DAYS,
  now: Date = new Date(),
): CalibrationStatus {
  const last = toDate(dates.lastCalibrationDate);
  if (!last) return 'GEEN_KALIBRATIE';

  const due = toDate(dates.nextCalibrationDue);
  if (!due) return 'GELDIG'; // gekalibreerd, maar geen verloopdatum berekend

  const days = Math.ceil((due.getTime() - now.getTime()) / MS_PER_DAY);
  if (days < 0) return 'VERLOPEN';
  if (days <= thresholdDays) return 'BINNENKORT';
  return 'GELDIG';
}

/**
 * Voegt `months` kalendermaanden toe aan een datum, met eind-van-maand-clamp
 * (31 jan + 1 mnd → 28/29 feb, niet 2/3 mrt). Muteert de input niet.
 */
export function addMonths(date: Date | string, months: number): Date {
  const base = typeof date === 'string' ? new Date(date) : new Date(date.getTime());
  const day = base.getDate();
  base.setMonth(base.getMonth() + months);
  if (base.getDate() < day) base.setDate(0);
  return base;
}
