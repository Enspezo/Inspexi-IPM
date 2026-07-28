import { describe, it, expect } from 'vitest';
import { ApiClientError } from '@/lib/api-client';
import {
  extractAvailabilityWarnings,
  formatAvailabilityWarning,
  type AvailabilityWarning,
} from './availability-warnings';

const warning: AvailabilityWarning = {
  userId: 'u1',
  name: 'Tom Visser',
  date: '2026-09-07',
  reason: 'Verlof — hele dag geblokkeerd',
};

describe('extractAvailabilityWarnings', () => {
  it('reads the warnings array from a 409 ApiClientError', () => {
    const err = new ApiClientError({
      message: 'Niet beschikbaar',
      statusCode: 409,
      warnings: [warning],
    });
    expect(extractAvailabilityWarnings(err)).toEqual([warning]);
  });

  it('returns [] for a non-409 error', () => {
    const err = new ApiClientError({ message: 'Fout', statusCode: 400, warnings: [warning] });
    expect(extractAvailabilityWarnings(err)).toEqual([]);
  });

  it('returns [] when there is no warnings array', () => {
    const err = new ApiClientError({ message: 'Conflict', statusCode: 409 });
    expect(extractAvailabilityWarnings(err)).toEqual([]);
  });

  it('filters out malformed warning entries', () => {
    const err = new ApiClientError({
      message: 'Niet beschikbaar',
      statusCode: 409,
      warnings: [warning, { userId: 'x' }, null, 'bad'],
    });
    expect(extractAvailabilityWarnings(err)).toEqual([warning]);
  });

  it('returns [] for a plain Error', () => {
    expect(extractAvailabilityWarnings(new Error('boom'))).toEqual([]);
  });
});

describe('formatAvailabilityWarning', () => {
  it('formats a readable Dutch sentence with a long UTC date', () => {
    expect(formatAvailabilityWarning(warning)).toBe(
      'Tom Visser is niet beschikbaar op 7 september 2026 (Verlof — hele dag geblokkeerd).',
    );
  });
});
