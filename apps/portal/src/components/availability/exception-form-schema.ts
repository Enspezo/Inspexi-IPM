/**
 * Zod-schema + payload-mapping voor de uitzondering-modal (PRD-12 §12.8b). De
 * validatieregels spiegelen de API (`validateExceptionInput`, PRD §12.4):
 * eenmalig XOR herhalend, `start < eind`, herhalend vereist weekdagen +
 * (tenzij hele dag) tijden + begindatum.
 *
 * Bewust los van React zodat het schema en de mapping unit-testbaar zijn.
 */
import { z } from 'zod';
import type { AvailabilityException } from '@/types';
import { AvailabilityExceptionType } from '@/types';
import type { ExceptionInput } from '@/pages/availability/hooks/use-availability';
import { timeToMinutes, timeFromISO, dateKeyFromISO } from './format-availability';

export type ExceptionMode = 'eenmalig' | 'herhalend';

export interface ExceptionFormValues {
  type: AvailabilityExceptionType;
  mode: ExceptionMode;
  reason: string;
  allDay: boolean;
  startTime: string; // HH:MM (gebruikt wanneer !allDay)
  endTime: string; // HH:MM
  // Eenmalig
  date: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (t/m; optioneel, alleen bij hele dag meerdaags)
  // Herhalend
  weekdays: number[];
  intervalWeeks: number;
  recurStartDate: string; // YYYY-MM-DD
  recurEndDate: string; // YYYY-MM-DD (optioneel)
}

export const emptyExceptionForm = (
  type: AvailabilityExceptionType = AvailabilityExceptionType.GEBLOKKEERD,
): ExceptionFormValues => ({
  type,
  mode: 'eenmalig',
  reason: '',
  allDay: false,
  startTime: '09:00',
  endTime: '17:00',
  date: '',
  endDate: '',
  weekdays: [],
  intervalWeeks: 1,
  recurStartDate: '',
  recurEndDate: '',
});

export const exceptionFormSchema = z
  .object({
    type: z.nativeEnum(AvailabilityExceptionType),
    mode: z.enum(['eenmalig', 'herhalend']),
    reason: z.string().max(500, 'Maximaal 500 tekens').optional().default(''),
    allDay: z.boolean(),
    startTime: z.string().optional().default(''),
    endTime: z.string().optional().default(''),
    date: z.string().optional().default(''),
    endDate: z.string().optional().default(''),
    weekdays: z.array(z.number().int().min(1).max(7)).default([]),
    intervalWeeks: z.number().int().min(1, 'Interval moet minimaal 1 week zijn').default(1),
    recurStartDate: z.string().optional().default(''),
    recurEndDate: z.string().optional().default(''),
  })
  .superRefine((v, ctx) => {
    const requireTimes = () => {
      const start = timeToMinutes(v.startTime);
      const end = timeToMinutes(v.endTime);
      if (start == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: 'Starttijd is verplicht' });
      }
      if (end == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Eindtijd is verplicht' });
      }
      if (start != null && end != null && start >= end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endTime'],
          message: 'Eindtijd moet na de starttijd liggen',
        });
      }
    };

    if (v.mode === 'eenmalig') {
      if (!v.date) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'Datum is verplicht' });
      }
      if (!v.allDay) {
        requireTimes();
      } else if (v.endDate && v.date && v.endDate < v.date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'Einddatum mag niet vóór de begindatum liggen',
        });
      }
    } else {
      // herhalend
      if (!v.weekdays || v.weekdays.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weekdays'],
          message: 'Kies minimaal één weekdag',
        });
      }
      if (!v.recurStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recurStartDate'],
          message: 'Begindatum is verplicht',
        });
      }
      if (v.recurEndDate && v.recurStartDate && v.recurEndDate < v.recurStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recurEndDate'],
          message: 'Einddatum mag niet vóór de begindatum liggen',
        });
      }
      if (!v.allDay) {
        requireTimes();
      }
    }
  });

/** "YYYY-MM-DD" → volgende dag "YYYY-MM-DD" (UTC-veilig). */
export function nextDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Formuliermodel → API-payload. Tijden worden als UTC-wandkloktijd verstuurd
 * (`…Z`) zodat de backend-resolutie (die instants als UTC leest) de juiste
 * minuut-op-de-dag afleidt.
 */
export function exceptionFormToInput(
  values: ExceptionFormValues,
  userId: string,
): ExceptionInput {
  const base: ExceptionInput = {
    userId,
    type: values.type,
    isRecurring: values.mode === 'herhalend',
    reason: values.reason.trim() || null,
  };

  if (values.mode === 'eenmalig') {
    if (values.allDay) {
      const endKey = values.endDate || values.date;
      return {
        ...base,
        allDay: true,
        startsAt: `${values.date}T00:00:00.000Z`,
        endsAt: `${nextDay(endKey)}T00:00:00.000Z`,
      };
    }
    return {
      ...base,
      allDay: false,
      startsAt: `${values.date}T${values.startTime}:00.000Z`,
      endsAt: `${values.date}T${values.endTime}:00.000Z`,
    };
  }

  // Herhalend
  return {
    ...base,
    allDay: values.allDay,
    weekdays: [...values.weekdays].sort((a, b) => a - b),
    startMinute: values.allDay ? null : timeToMinutes(values.startTime),
    endMinute: values.allDay ? null : timeToMinutes(values.endTime),
    intervalWeeks: values.intervalWeeks,
    recurStartDate: values.recurStartDate,
    recurEndDate: values.recurEndDate || null,
  };
}

/** Bestaande uitzondering → formuliermodel (voor bewerken). */
export function exceptionToFormValues(exc: AvailabilityException): ExceptionFormValues {
  const base = emptyExceptionForm(exc.type);
  if (exc.isRecurring) {
    return {
      ...base,
      mode: 'herhalend',
      reason: exc.reason ?? '',
      allDay: exc.allDay,
      startTime: exc.startMinute != null ? minutesToHHMM(exc.startMinute) : '09:00',
      endTime: exc.endMinute != null ? minutesToHHMM(exc.endMinute) : '17:00',
      weekdays: exc.weekdays ?? [],
      intervalWeeks: exc.intervalWeeks || 1,
      recurStartDate: exc.recurStartDate ? exc.recurStartDate.slice(0, 10) : '',
      recurEndDate: exc.recurEndDate ? exc.recurEndDate.slice(0, 10) : '',
    };
  }

  // Eenmalig — leid de laatste inclusieve dag af (endsAt is exclusief).
  const startKey = dateKeyFromISO(exc.startsAt);
  let endDate = '';
  if (exc.allDay && exc.endsAt) {
    const endExclusive = new Date(exc.endsAt);
    const inclusive = new Date(endExclusive.getTime() - 86_400_000);
    const inclKey = inclusive.toISOString().slice(0, 10);
    if (inclKey > startKey) endDate = inclKey;
  }
  return {
    ...base,
    mode: 'eenmalig',
    reason: exc.reason ?? '',
    allDay: exc.allDay,
    date: startKey,
    endDate,
    startTime: timeFromISO(exc.startsAt) || '09:00',
    endTime: timeFromISO(exc.endsAt) || '17:00',
  };
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
