import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatShortDate,
} from './format';

describe('formatDate', () => {
  it('formats ISO strings as long Dutch date', () => {
    expect(formatDate('2026-06-08T12:00:00Z')).toBe('8 juni 2026');
  });

  it('accepts Date objects', () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe('15 januari 2026');
  });

  it('returns em dash for null, undefined, empty and invalid input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('formatShortDate', () => {
  it('formats with abbreviated month', () => {
    expect(formatShortDate('2026-06-08T12:00:00Z')).toBe('8 jun 2026');
  });
});

describe('formatDateTime', () => {
  it('includes time', () => {
    const result = formatDateTime(new Date(2026, 5, 8, 14, 30));
    expect(result).toContain('8 jun 2026');
    expect(result).toContain('14:30');
  });

  it('returns em dash for empty input', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatCurrency', () => {
  it('formats numbers as EUR with Dutch separators', () => {
    // nl-NL gebruikt non-breaking space tussen € en bedrag
    expect(formatCurrency(1234.56).replace(/ /g, ' ')).toBe('€ 1.234,56');
  });

  it('accepts numeric strings (API decimals)', () => {
    expect(formatCurrency('99.5').replace(/ /g, ' ')).toBe('€ 99,50');
  });

  it('returns em dash for null, undefined and non-numeric strings', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
    expect(formatCurrency('abc')).toBe('—');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('returns em dash for null/undefined', () => {
    expect(formatFileSize(null)).toBe('—');
  });
});
