import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiClientError } from '@/lib/api-client';
import { QueryErrorNotice } from './query-error-notice';

describe('QueryErrorNotice', () => {
  it('rendert niets zonder error', () => {
    const { container } = render(<QueryErrorNotice error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('toont label + servermelding bij een ApiClientError', () => {
    const error = new ApiClientError({
      message: 'limit must not be greater than 100',
      statusCode: 400,
    });

    render(<QueryErrorNotice error={error} label="Opdrachtgevers" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Opdrachtgevers laden mislukt: limit must not be greater than 100',
    );
  });

  it('valt terug op een generieke melding bij onbekende fouten', () => {
    render(<QueryErrorNotice error={new Error('boem')} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Gegevens laden mislukt: onbekende fout',
    );
  });

  it('toont een "Opnieuw proberen"-knop die onRetry aanroept', async () => {
    const onRetry = vi.fn();
    render(<QueryErrorNotice error={new Error('boem')} onRetry={onRetry} />);

    screen.getByRole('button', { name: 'Opnieuw proberen' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('toont geen retry-knop zonder onRetry', () => {
    render(<QueryErrorNotice error={new Error('boem')} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
