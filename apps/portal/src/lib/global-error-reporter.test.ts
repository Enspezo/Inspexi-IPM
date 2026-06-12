import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/lib/api-client';
import {
  ErrorReportThrottle,
  normalizeReason,
  type NormalizedError,
} from './global-error-reporter';

describe('normalizeReason', () => {
  it('skips ApiClientError instances', () => {
    const err = new ApiClientError({ message: 'Sessie verlopen', statusCode: 401 });
    expect(normalizeReason(err)).toBeNull();
  });

  it('skips objects whose name is ApiClientError (cross-realm)', () => {
    expect(normalizeReason({ name: 'ApiClientError', message: 'x' })).toBeNull();
  });

  it('normalizes real Error objects with message and stack', () => {
    const err = new Error('boom');
    const result = normalizeReason(err);
    expect(result?.message).toBe('boom');
    expect(typeof result?.stack).toBe('string');
  });

  it('uses fallback message for Error without message', () => {
    expect(normalizeReason(new Error(''))?.message).toBe('Onbekende fout');
  });

  it('stringifies non-Error string reasons', () => {
    expect(normalizeReason('plain string failure')).toEqual({
      message: 'plain string failure',
      stack: null,
    });
  });

  it('stringifies non-Error object reasons defensively', () => {
    expect(normalizeReason({ code: 42 })).toEqual({
      message: '{"code":42}',
      stack: null,
    });
  });

  it('returns null for null/undefined reasons', () => {
    expect(normalizeReason(null)).toBeNull();
    expect(normalizeReason(undefined)).toBeNull();
  });

  it('does not throw on circular non-Error objects', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = normalizeReason(circular);
    // JSON.stringify throws → caught → String() fallback, message is non-empty
    expect(result?.message).toBeTruthy();
    expect(result?.stack).toBeNull();
  });
});

describe('ErrorReportThrottle', () => {
  const mk = (message: string, stack: string | null = null): NormalizedError => ({
    message,
    stack,
  });

  it('reports a unique error once and dedups repeats within the session', () => {
    const t = new ErrorReportThrottle();
    expect(t.shouldReport(mk('boom', 'stack-a'))).toBe(true);
    expect(t.shouldReport(mk('boom', 'stack-a'))).toBe(false);
    expect(t.shouldReport(mk('boom', 'stack-a'))).toBe(false);
  });

  it('treats different message or stack as distinct', () => {
    const t = new ErrorReportThrottle();
    expect(t.shouldReport(mk('boom', 'stack-a'))).toBe(true);
    expect(t.shouldReport(mk('boom', 'stack-b'))).toBe(true);
    expect(t.shouldReport(mk('bang', 'stack-a'))).toBe(true);
  });

  it('enforces the max-per-window rate limit across distinct errors', () => {
    let now = 1000;
    const t = new ErrorReportThrottle(5, 60_000, () => now);
    for (let i = 0; i < 5; i++) {
      expect(t.shouldReport(mk(`err-${i}`))).toBe(true);
    }
    // 6th distinct error within the window is rate-limited
    expect(t.shouldReport(mk('err-5'))).toBe(false);
  });

  it('allows new reports once the window has passed', () => {
    let now = 1000;
    const t = new ErrorReportThrottle(2, 60_000, () => now);
    expect(t.shouldReport(mk('a'))).toBe(true);
    expect(t.shouldReport(mk('b'))).toBe(true);
    expect(t.shouldReport(mk('c'))).toBe(false);

    now += 60_001; // window elapsed
    expect(t.shouldReport(mk('c'))).toBe(true);
  });
});
