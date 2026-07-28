import { describe, it, expect } from 'vitest';
import { AvailabilityExceptionType } from '@/types';
import {
  exceptionFormSchema,
  exceptionFormToInput,
  emptyExceptionForm,
  nextDay,
  type ExceptionFormValues,
} from './exception-form-schema';

function values(overrides: Partial<ExceptionFormValues>): ExceptionFormValues {
  return { ...emptyExceptionForm(), ...overrides };
}

/** Verzamelt de foutpaden van een mislukte parse. */
function errorPaths(v: ExceptionFormValues): string[] {
  const result = exceptionFormSchema.safeParse(v);
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join('.'));
}

describe('exceptionFormSchema — eenmalig', () => {
  it('accepteert een geldige getimede eenmalige uitzondering', () => {
    const result = exceptionFormSchema.safeParse(
      values({ mode: 'eenmalig', date: '2026-07-08', startTime: '09:00', endTime: '12:00' }),
    );
    expect(result.success).toBe(true);
  });

  it('vereist een datum', () => {
    expect(errorPaths(values({ mode: 'eenmalig', date: '', startTime: '09:00', endTime: '12:00' }))).toContain('date');
  });

  it('vereist een eindtijd wanneer niet hele dag', () => {
    expect(
      errorPaths(values({ mode: 'eenmalig', date: '2026-07-08', startTime: '09:00', endTime: '' })),
    ).toContain('endTime');
  });

  it('verwerpt start >= eind', () => {
    expect(
      errorPaths(values({ mode: 'eenmalig', date: '2026-07-08', startTime: '17:00', endTime: '09:00' })),
    ).toContain('endTime');
  });

  it('hele dag heeft geen tijden nodig', () => {
    const result = exceptionFormSchema.safeParse(
      values({ mode: 'eenmalig', allDay: true, date: '2026-07-08', startTime: '', endTime: '' }),
    );
    expect(result.success).toBe(true);
  });

  it('verwerpt een einddatum vóór de begindatum (hele dag)', () => {
    expect(
      errorPaths(values({ mode: 'eenmalig', allDay: true, date: '2026-07-08', endDate: '2026-07-01' })),
    ).toContain('endDate');
  });
});

describe('exceptionFormSchema — herhalend', () => {
  it('accepteert een geldig wekelijks patroon', () => {
    const result = exceptionFormSchema.safeParse(
      values({
        mode: 'herhalend',
        weekdays: [1, 3],
        startTime: '01:00',
        endTime: '05:00',
        recurStartDate: '2026-01-05',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('vereist minimaal één weekdag', () => {
    expect(
      errorPaths(values({ mode: 'herhalend', weekdays: [], startTime: '01:00', endTime: '05:00', recurStartDate: '2026-01-05' })),
    ).toContain('weekdays');
  });

  it('vereist een begindatum', () => {
    expect(
      errorPaths(values({ mode: 'herhalend', weekdays: [1], startTime: '01:00', endTime: '05:00', recurStartDate: '' })),
    ).toContain('recurStartDate');
  });

  it('verwerpt een einddatum vóór de begindatum', () => {
    expect(
      errorPaths(
        values({
          mode: 'herhalend',
          weekdays: [1],
          startTime: '01:00',
          endTime: '05:00',
          recurStartDate: '2026-06-01',
          recurEndDate: '2026-01-01',
        }),
      ),
    ).toContain('recurEndDate');
  });

  it('vereist tijden wanneer niet hele dag', () => {
    const paths = errorPaths(
      values({ mode: 'herhalend', weekdays: [1], startTime: '', endTime: '', recurStartDate: '2026-01-05' }),
    );
    expect(paths).toContain('startTime');
    expect(paths).toContain('endTime');
  });
});

describe('exceptionFormToInput', () => {
  it('mapt een getimede eenmalige uitzondering naar UTC-instants', () => {
    const input = exceptionFormToInput(
      values({
        type: AvailabilityExceptionType.GEBLOKKEERD,
        mode: 'eenmalig',
        date: '2026-07-08',
        startTime: '09:00',
        endTime: '12:00',
        reason: 'Verlof',
      }),
      'user-1',
    );
    expect(input).toMatchObject({
      userId: 'user-1',
      type: AvailabilityExceptionType.GEBLOKKEERD,
      isRecurring: false,
      allDay: false,
      startsAt: '2026-07-08T09:00:00.000Z',
      endsAt: '2026-07-08T12:00:00.000Z',
      reason: 'Verlof',
    });
  });

  it('mapt een hele-dag eenmalige uitzondering met exclusief einde', () => {
    const input = exceptionFormToInput(
      values({ mode: 'eenmalig', allDay: true, date: '2026-07-08' }),
      'user-1',
    );
    expect(input.startsAt).toBe('2026-07-08T00:00:00.000Z');
    expect(input.endsAt).toBe('2026-07-09T00:00:00.000Z');
    expect(input.allDay).toBe(true);
  });

  it('mapt een herhalend patroon en sorteert de weekdagen', () => {
    const input = exceptionFormToInput(
      values({
        mode: 'herhalend',
        type: AvailabilityExceptionType.BESCHIKBAAR,
        weekdays: [3, 1],
        startTime: '01:00',
        endTime: '05:00',
        intervalWeeks: 2,
        recurStartDate: '2026-01-05',
        recurEndDate: '',
      }),
      'user-2',
    );
    expect(input).toMatchObject({
      isRecurring: true,
      weekdays: [1, 3],
      startMinute: 60,
      endMinute: 300,
      intervalWeeks: 2,
      recurStartDate: '2026-01-05',
      recurEndDate: null,
    });
  });
});

describe('nextDay', () => {
  it('gaat een dag vooruit (UTC-veilig, ook over maandgrens)', () => {
    expect(nextDay('2026-07-08')).toBe('2026-07-09');
    expect(nextDay('2026-07-31')).toBe('2026-08-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
});
