import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClientError } from '@/lib/api-client';
import {
  handleQueryError,
  registerQueryErrorToaster,
  resetQueryErrorToastDedupe,
  QUERY_ERROR_TOAST_DEDUPE_MS,
} from './query-error-toast';

describe('handleQueryError (globale query-foutafhandeling, WP-B6/B-305)', () => {
  const toaster = vi.fn();
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetQueryErrorToastDedupe();
    registerQueryErrorToaster(toaster);
    toaster.mockClear();
  });

  afterEach(() => {
    registerQueryErrorToaster(null);
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('toont een error-toast met de servermelding', () => {
    const error = new ApiClientError({
      message: 'limit must not be greater than 100',
      statusCode: 400,
    });

    handleQueryError(error, { queryKey: ['contacts', 'list'] });

    expect(toaster).toHaveBeenCalledTimes(1);
    expect(toaster).toHaveBeenCalledWith(
      'Gegevens laden mislukt: limit must not be greater than 100',
      'error',
    );
  });

  it('logt de fout altijd naar de console (nooit meer stil)', () => {
    const error = new Error('netwerkfout');
    handleQueryError(error, { queryKey: ['tasks'] });

    expect(consoleSpy).toHaveBeenCalledWith('[query-error]', ['tasks'], error);
  });

  it('dedupliceert identieke meldingen binnen het dedupe-venster', () => {
    const error = new ApiClientError({ message: 'kapot', statusCode: 400 });

    handleQueryError(error, { queryKey: ['a'] });
    handleQueryError(error, { queryKey: ['b'] });

    expect(toaster).toHaveBeenCalledTimes(1);

    // Ná het venster mag dezelfde melding opnieuw.
    vi.advanceTimersByTime(QUERY_ERROR_TOAST_DEDUPE_MS + 1);
    handleQueryError(error, { queryKey: ['c'] });
    expect(toaster).toHaveBeenCalledTimes(2);
  });

  it('respecteert meta.suppressErrorToast (opt-out), maar logt wél', () => {
    const error = new Error('al inline afgehandeld');
    handleQueryError(error, {
      queryKey: ['x'],
      meta: { suppressErrorToast: true },
    });

    expect(toaster).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('slaat 401-fouten over (auth-flow redirect al)', () => {
    const error = new ApiClientError({ message: 'Niet ingelogd', statusCode: 401 });
    handleQueryError(error, { queryKey: ['me'] });

    expect(toaster).not.toHaveBeenCalled();
  });

  it('valt terug op een generieke melding bij niet-API-fouten', () => {
    handleQueryError(new Error('TypeError: Failed to fetch'), { queryKey: ['y'] });

    expect(toaster).toHaveBeenCalledWith(
      'Gegevens laden mislukt: onbekende fout',
      'error',
    );
  });
});
