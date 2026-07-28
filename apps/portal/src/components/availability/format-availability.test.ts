import { describe, it, expect } from 'vitest';
import {
  minutesToTime,
  timeToMinutes,
  formatTimeRange,
  formatWeekdays,
  weekdayShort,
  computeWeeklyMinutes,
  formatHours,
  formatExceptionPeriod,
} from './format-availability';

describe('minutesToTime', () => {
  it('formatteert minuten naar HH:MM', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(540)).toBe('09:00');
    expect(minutesToTime(1050)).toBe('17:30');
    expect(minutesToTime(1440)).toBe('24:00');
  });
  it('clamt buiten bereik', () => {
    expect(minutesToTime(-30)).toBe('00:00');
    expect(minutesToTime(2000)).toBe('24:00');
  });
});

describe('timeToMinutes', () => {
  it('parseert geldige tijden', () => {
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('17:30')).toBe(1050);
  });
  it('geeft null bij ongeldige invoer', () => {
    expect(timeToMinutes('')).toBeNull();
    expect(timeToMinutes(undefined)).toBeNull();
    expect(timeToMinutes('kwart voor')).toBeNull();
    expect(timeToMinutes('25:00')).toBeNull();
    expect(timeToMinutes('10:99')).toBeNull();
  });
});

describe('formatTimeRange', () => {
  it('koppelt begin en eind met en-dash', () => {
    expect(formatTimeRange(480, 1050)).toBe('08:00–17:30');
  });
});

describe('formatWeekdays', () => {
  it('sorteert, dedupliceert en gebruikt korte NL-labels', () => {
    expect(formatWeekdays([3, 1, 1, 7])).toBe('ma, wo, zo');
    expect(formatWeekdays([2, 4])).toBe('di, do');
  });
  it('filtert ongeldige waarden', () => {
    expect(formatWeekdays([0, 8, 5])).toBe('vr');
  });
  it('weekdayShort mapt ISO-weekdagen', () => {
    expect(weekdayShort(1)).toBe('ma');
    expect(weekdayShort(7)).toBe('zo');
  });
});

describe('computeWeeklyMinutes + formatHours', () => {
  it('telt slotminuten op', () => {
    expect(
      computeWeeklyMinutes([
        { startMinute: 480, endMinute: 1050 },
        { startMinute: 480, endMinute: 1050 },
      ]),
    ).toBe(1140);
  });
  it('negeert inverse slots', () => {
    expect(computeWeeklyMinutes([{ startMinute: 600, endMinute: 500 }])).toBe(0);
  });
  it('formatteert uren met decimaal-komma', () => {
    expect(formatHours(2400)).toBe('40,0 uur');
    expect(formatHours(2850)).toBe('47,5 uur');
    expect(formatHours(0)).toBe('0,0 uur');
  });
});

describe('formatExceptionPeriod — herhalend', () => {
  const base = {
    startsAt: null,
    endsAt: null,
    isRecurring: true,
  } as const;

  it('wekelijks met tijden', () => {
    const out = formatExceptionPeriod({
      ...base,
      allDay: false,
      weekdays: [3, 1],
      startMinute: 60,
      endMinute: 300,
      intervalWeeks: 1,
      recurStartDate: null,
      recurEndDate: null,
    });
    expect(out).toContain('Elke ma, wo 01:00–05:00');
  });

  it('tweewekelijks, hele dag', () => {
    const out = formatExceptionPeriod({
      ...base,
      allDay: true,
      weekdays: [2, 4],
      startMinute: null,
      endMinute: null,
      intervalWeeks: 2,
      recurStartDate: null,
      recurEndDate: null,
    });
    expect(out).toContain('Elke 2 weken di, do hele dag');
  });
});

describe('formatExceptionPeriod — eenmalig', () => {
  it('getimede periode op één dag', () => {
    const out = formatExceptionPeriod({
      isRecurring: false,
      allDay: false,
      startsAt: '2026-07-08T09:00:00.000Z',
      endsAt: '2026-07-08T12:00:00.000Z',
      weekdays: [],
      startMinute: null,
      endMinute: null,
      intervalWeeks: 1,
      recurStartDate: null,
      recurEndDate: null,
    });
    expect(out).toContain('09:00–12:00');
    expect(out).toContain('juli');
  });

  it('hele dag, enkele dag', () => {
    const out = formatExceptionPeriod({
      isRecurring: false,
      allDay: true,
      startsAt: '2026-07-08T00:00:00.000Z',
      endsAt: '2026-07-09T00:00:00.000Z',
      weekdays: [],
      startMinute: null,
      endMinute: null,
      intervalWeeks: 1,
      recurStartDate: null,
      recurEndDate: null,
    });
    expect(out).toContain('(hele dag)');
    expect(out).not.toContain('–');
  });
});
