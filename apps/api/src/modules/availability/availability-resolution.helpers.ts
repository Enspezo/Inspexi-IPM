import { AvailabilityExceptionType } from '@prisma/client';

/**
 * Pure, Prisma-vrije kern van de beschikbaarheids-resolutie (PRD-12 §12.5).
 *
 * Alle functies werken op **minuten vanaf middernacht** binnen één kalenderdag
 * en op **UTC-veilige date-keys** (`'YYYY-MM-DD'`). Datum-only-velden
 * (`recurStartDate`/`recurEndDate`/`validFrom`) komen uit `@db.Date`-kolommen en
 * arriveren als `Date` op UTC-middernacht; timestamp-velden (`startsAt`/`endsAt`)
 * worden consequent via UTC ontleed. Zo is de wiskunde deterministisch,
 * DST-vrij en tijdzone-onafhankelijk — de tests draaien op elke machine gelijk.
 *
 * Conventie: één tijdzone (Europe/Amsterdam, PRD §12.3.4); absolute instants
 * worden als UTC-wandkloktijd geïnterpreteerd zodat de kalenderdag en de
 * minuut-op-de-dag eenduidig zijn.
 */

/** Halfopen tijdsinterval binnen een dag: [startMinute, endMinute) in minuten. */
export interface Interval {
  startMinute: number;
  endMinute: number;
}

/** Bron die (mede) bepaalt waarom iemand op een dag (niet) beschikbaar is. */
export interface DaySource {
  kind: 'TEMPLATE' | 'EXCEPTION';
  id: string;
  type?: AvailabilityExceptionType;
}

/** Minimale exceptie-vorm die de resolutie nodig heeft (los van Prisma). */
export interface ExceptionLike {
  id: string;
  type: AvailabilityExceptionType;
  // Eenmalig (isRecurring = false):
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  // Herhalend (isRecurring = true):
  isRecurring: boolean;
  weekdays: number[];
  startMinute: number | null;
  endMinute: number | null;
  intervalWeeks: number;
  recurStartDate: Date | null;
  recurEndDate: Date | null;
  /** Optioneel — alleen gebruikt om een conflict-reden op te bouwen (check). */
  reason?: string | null;
}

const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

// ─── Interval-algebra ─────────────────────────────────────────

/**
 * Sorteer en voeg intervallen samen. Overlappende **én aangrenzende**
 * (rakende, `end === start`) intervallen worden samengevoegd. Lege of inverse
 * intervallen (`end <= start`) worden verwijderd.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals
    .filter((i) => i.endMinute > i.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const out: Interval[] = [];
  for (const iv of valid) {
    const last = out[out.length - 1];
    if (last && iv.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, iv.endMinute);
    } else {
      out.push({ startMinute: iv.startMinute, endMinute: iv.endMinute });
    }
  }
  return out;
}

/**
 * Trek `minus` af van `base`. Beide worden eerst genormaliseerd (merge); het
 * resultaat is genormaliseerd en niet-overlappend.
 */
export function subtractIntervals(base: Interval[], minus: Interval[]): Interval[] {
  const merged = mergeIntervals(base);
  const cuts = mergeIntervals(minus);
  if (cuts.length === 0) return merged;

  const out: Interval[] = [];
  for (const iv of merged) {
    let segments: Interval[] = [{ startMinute: iv.startMinute, endMinute: iv.endMinute }];
    for (const cut of cuts) {
      const next: Interval[] = [];
      for (const seg of segments) {
        // Geen overlap → segment blijft ongewijzigd.
        if (cut.endMinute <= seg.startMinute || cut.startMinute >= seg.endMinute) {
          next.push(seg);
          continue;
        }
        // Deel links van de snede.
        if (cut.startMinute > seg.startMinute) {
          next.push({ startMinute: seg.startMinute, endMinute: cut.startMinute });
        }
        // Deel rechts van de snede.
        if (cut.endMinute < seg.endMinute) {
          next.push({ startMinute: cut.endMinute, endMinute: seg.endMinute });
        }
      }
      segments = next;
    }
    out.push(...segments);
  }
  return mergeIntervals(out);
}

/** Doorsnede van twee interval-sets (genormaliseerd). */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const out: Interval[] = [];
  for (const x of left) {
    for (const y of right) {
      const startMinute = Math.max(x.startMinute, y.startMinute);
      const endMinute = Math.min(x.endMinute, y.endMinute);
      if (startMinute < endMinute) out.push({ startMinute, endMinute });
    }
  }
  return mergeIntervals(out);
}

// ─── Date-key-helpers (UTC-veilig) ────────────────────────────

/** `Date` → `'YYYY-MM-DD'` via UTC-componenten. */
export function dateKeyOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `'YYYY-MM-DD'` → `Date` op UTC-middernacht. */
export function dateKeyToUTC(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** ISO-8601 weekdag (1 = maandag … 7 = zondag). */
export function isoWeekday(key: string): number {
  const dow = dateKeyToUTC(key).getUTCDay(); // 0 = zondag … 6 = zaterdag
  return dow === 0 ? 7 : dow;
}

/** De maandag (date-key) van de week waarin `key` valt. */
export function mondayOf(key: string): string {
  const iso = isoWeekday(key);
  const d = dateKeyToUTC(key);
  d.setUTCDate(d.getUTCDate() - (iso - 1));
  return dateKeyOf(d);
}

/** Aantal hele dagen van `aKey` tot `bKey` (positief als `bKey` later is). */
export function diffDays(aKey: string, bKey: string): number {
  const a = dateKeyToUTC(aKey).getTime();
  const b = dateKeyToUTC(bKey).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** Alle date-keys van `fromKey` t/m `toKey` (inclusief). */
export function eachDateKey(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  const end = dateKeyToUTC(toKey).getTime();
  for (let t = dateKeyToUTC(fromKey).getTime(); t <= end; t += MS_PER_DAY) {
    out.push(dateKeyOf(new Date(t)));
  }
  return out;
}

/** Absolute minuten sinds epoch (UTC) — voor eenmalige overlap-berekening. */
function absMinutes(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_MINUTE);
}

// ─── Exceptie-expansie ────────────────────────────────────────

/**
 * Bepaal welke minuten binnen dag `dateKey` een **eenmalige** exceptie raakt.
 *
 * `endsAt` is een EXCLUSIEF einde. Bij `allDay` levert elke aangeraakte dag de
 * hele dag (0..1440); anders de op de dag geknipte minuten (juiste begin-/
 * eindminuut op de eerste/laatste dag, volledige dagen ertussen).
 */
export function expandOneOff(exc: ExceptionLike, dateKey: string): Interval[] {
  if (!exc.startsAt || !exc.endsAt) return [];

  const dayStartAbs = absMinutes(dateKeyToUTC(dateKey));
  const dayEndAbs = dayStartAbs + MINUTES_PER_DAY;
  const excStartAbs = absMinutes(exc.startsAt);
  const excEndAbs = absMinutes(exc.endsAt);

  const overlapStart = Math.max(excStartAbs, dayStartAbs);
  const overlapEnd = Math.min(excEndAbs, dayEndAbs);
  if (overlapStart >= overlapEnd) return [];

  if (exc.allDay) return [{ startMinute: 0, endMinute: MINUTES_PER_DAY }];
  return [{ startMinute: overlapStart - dayStartAbs, endMinute: overlapEnd - dayStartAbs }];
}

/**
 * Bepaal welke minuten binnen dag `dateKey` een **herhalende** (FREQ=WEEKLY)
 * exceptie raakt. Matcht op weekdag, binnen `recurStartDate..recurEndDate`
 * (einde inclusief t/m) en op de `intervalWeeks`-cadans vanaf de maandag van
 * `recurStartDate`.
 */
export function expandRecurring(exc: ExceptionLike, dateKey: string): Interval[] {
  if (!exc.recurStartDate) return [];

  const weekday = isoWeekday(dateKey);
  if (!exc.weekdays.includes(weekday)) return [];

  const startKey = dateKeyOf(exc.recurStartDate);
  if (diffDays(startKey, dateKey) < 0) return []; // vóór de startdatum
  if (exc.recurEndDate && diffDays(dateKey, dateKeyOf(exc.recurEndDate)) < 0) {
    return []; // ná de einddatum (inclusief t/m)
  }

  const interval = Math.max(1, exc.intervalWeeks || 1);
  const weeksApart = Math.floor(diffDays(mondayOf(startKey), mondayOf(dateKey)) / 7);
  if (weeksApart % interval !== 0) return [];

  if (exc.allDay || exc.startMinute == null || exc.endMinute == null) {
    return [{ startMinute: 0, endMinute: MINUTES_PER_DAY }];
  }
  return [{ startMinute: exc.startMinute, endMinute: exc.endMinute }];
}

/** Eenmalig of herhalend, afhankelijk van `isRecurring`. */
export function expandException(exc: ExceptionLike, dateKey: string): Interval[] {
  return exc.isRecurring ? expandRecurring(exc, dateKey) : expandOneOff(exc, dateKey);
}

// ─── Dag-resolutie ────────────────────────────────────────────

/**
 * Combineer de drie lagen tot het eindresultaat voor één dag.
 *
 * Precedentie **GEBLOKKEERD > BESCHIKBAAR > baseline**: eerst union(baseline,
 * plus), daarna subtract(minus). Resultaat is genormaliseerd (gesorteerd,
 * samengevoegd, niet-overlappend).
 */
export function resolveDay(
  baseline: Interval[],
  plus: Interval[],
  minus: Interval[],
): Interval[] {
  const available = mergeIntervals([...baseline, ...plus]);
  return subtractIntervals(available, minus);
}
