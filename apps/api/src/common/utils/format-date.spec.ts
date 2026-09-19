import {
  formatDateNl,
  formatDateTimeNl,
  formatShortDateNl,
  formatShortDateTimeNl,
  formatTimeNl,
  formatWeekdayDateNl,
} from './format-date';

describe('format-date (NL, tijdzone-bewust)', () => {
  // 2026-06-08T12:30:00Z = 14:30 in Europe/Amsterdam (CEST).
  const noon = new Date('2026-06-08T12:30:00Z');
  // 2026-06-08T22:30:00Z = 00:30 op 9 juni in Amsterdam — de klassieke datum-flip.
  const lateEvening = new Date('2026-06-08T22:30:00Z');

  it('formatDateNl → "8 juni 2026"', () => {
    expect(formatDateNl(noon)).toBe('8 juni 2026');
  });

  it('formatDateTimeNl → "8 juni 2026, 14:30"', () => {
    expect(formatDateTimeNl(noon)).toBe('8 juni 2026, 14:30');
  });

  it('formatTimeNl → "14:30" (2-digit)', () => {
    expect(formatTimeNl(noon)).toBe('14:30');
    expect(formatTimeNl(new Date('2026-06-08T07:05:00Z'))).toBe('09:05');
  });

  it('formatWeekdayDateNl → "maandag 8 juni 2026"', () => {
    expect(formatWeekdayDateNl(noon)).toBe('maandag 8 juni 2026');
  });

  it('formatShortDateNl / formatShortDateTimeNl → dd-mm-jjjj', () => {
    expect(formatShortDateNl(noon)).toBe('08-06-2026');
    expect(formatShortDateTimeNl(noon)).toBe('08-06-2026, 14:30');
  });

  it('gebruikt de org-tijdzone, niet de proces-tijdzone (datum-flip rond middernacht)', () => {
    expect(formatDateNl(lateEvening)).toBe('9 juni 2026');
    expect(formatDateNl(lateEvening, 'UTC')).toBe('8 juni 2026');
    expect(formatTimeNl(lateEvening, 'UTC')).toBe('22:30');
  });

  it('accepteert ISO-strings en timestamps', () => {
    expect(formatDateNl('2026-06-08T12:30:00Z')).toBe('8 juni 2026');
    expect(formatDateNl(noon.getTime())).toBe('8 juni 2026');
  });
});
