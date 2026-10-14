import {
  durationMinutesBetween,
  formatDurationNl,
  isSameLocalDay,
  isoWeekOf,
  localDayEndUtc,
} from './time-tracking.helpers';

describe('time-tracking.helpers', () => {
  describe('isoWeekOf', () => {
    it('gewone midweek-datum', () => {
      // Donderdag 27 aug 2026 (vandaag in de PRD-tijdlijn)
      expect(isoWeekOf(new Date('2026-08-27T10:00:00Z'))).toEqual({ year: 2026, week: 35 });
    });

    it('jaarwissel: 1 jan valt in week 1 van het nieuwe ISO-jaar (2026 start op donderdag)', () => {
      expect(isoWeekOf(new Date('2026-01-01T12:00:00Z'))).toEqual({ year: 2026, week: 1 });
      // Maandag 29 dec 2025 hoort al bij week 1 van 2026
      expect(isoWeekOf(new Date('2025-12-29T12:00:00Z'))).toEqual({ year: 2026, week: 1 });
    });

    it('jaarwissel: 53-wekenjaar — vrijdag 1 jan 2027 hoort bij week 53 van 2026', () => {
      expect(isoWeekOf(new Date('2026-12-31T12:00:00Z'))).toEqual({ year: 2026, week: 53 });
      expect(isoWeekOf(new Date('2027-01-01T12:00:00Z'))).toEqual({ year: 2026, week: 53 });
    });

    it('tijdzone: zondagavond 23:30 UTC is in Amsterdam al maandag → volgende week', () => {
      // Zondag 23 aug 2026 22:30 UTC = maandag 24 aug 00:30 CEST
      const sundayEveningUtc = new Date('2026-08-23T22:30:00Z');
      expect(isoWeekOf(sundayEveningUtc)).toEqual({ year: 2026, week: 35 });
      expect(isoWeekOf(sundayEveningUtc, 'UTC')).toEqual({ year: 2026, week: 34 });
    });
  });

  describe('durationMinutesBetween', () => {
    it('rondt af op hele minuten en is nooit negatief', () => {
      const start = new Date('2026-08-27T08:00:00Z');
      expect(durationMinutesBetween(start, new Date('2026-08-27T09:25:31Z'))).toBe(86);
      expect(durationMinutesBetween(start, new Date('2026-08-27T07:00:00Z'))).toBe(0);
    });
  });

  describe('localDayEndUtc (nachtwaker)', () => {
    it('zomertijd: 23:59 CEST = 21:59 UTC', () => {
      expect(localDayEndUtc(new Date('2026-08-27T06:30:00Z')).toISOString()).toBe(
        '2026-08-27T21:59:00.000Z',
      );
    });

    it('wintertijd: 23:59 CET = 22:59 UTC', () => {
      expect(localDayEndUtc(new Date('2026-01-15T10:00:00Z')).toISOString()).toBe(
        '2026-01-15T22:59:00.000Z',
      );
    });

    it('laat op de avond (lokaal al volgende dag in UTC-termen) blijft dezelfde lokale dag', () => {
      // 22:30 UTC = 00:30 CEST de 28e → einde lokale dag = 28 aug 23:59 CEST
      expect(localDayEndUtc(new Date('2026-08-27T22:30:00Z')).toISOString()).toBe(
        '2026-08-28T21:59:00.000Z',
      );
    });
  });

  describe('isSameLocalDay', () => {
    it('vergelijkt op de lokale kalenderdag, niet op UTC', () => {
      const lateEvening = new Date('2026-08-27T21:30:00Z'); // 23:30 CEST 27 aug
      const pastMidnight = new Date('2026-08-27T22:30:00Z'); // 00:30 CEST 28 aug
      expect(isSameLocalDay(lateEvening, pastMidnight)).toBe(false);
      expect(isSameLocalDay(lateEvening, pastMidnight, 'UTC')).toBe(true);
    });
  });

  describe('formatDurationNl', () => {
    it.each([
      [25, '25m'],
      [60, '1u'],
      [85, '1u 25m'],
      [0, '0m'],
    ])('%i minuten → %s', (minutes, expected) => {
      expect(formatDurationNl(minutes)).toBe(expected);
    });
  });
});
