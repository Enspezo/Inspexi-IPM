// Representatieve regressietest voor WP-B6/B-305: een gefaalde dropdown-query
// (zoals de 400 op /contacts?limit=200 met de oude cap) mag nooit meer stil een
// lege dropdown opleveren — de modal toont een zichtbare foutstate.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { CreateContactPersonModal } from './create-contact-person-modal';

vi.mock('@/lib/api-client', async () => {
  const shared = await vi.importActual<typeof import('@inspexi/shared-web')>(
    '@inspexi/shared-web',
  );
  return {
    ApiClientError: shared.ApiClientError,
    getErrorMessage: shared.getErrorMessage,
    setAccessToken: vi.fn(),
    getAccessToken: vi.fn(() => null),
    setInitialized: vi.fn(),
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      upload: vi.fn(),
    },
  };
});

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CreateContactPersonModal isOpen onClose={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('CreateContactPersonModal — foutstate dropdown-query', () => {
  const mockedGet = vi.mocked(apiClient.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('toont een zichtbare foutmelding wanneer de relatie-query faalt', async () => {
    mockedGet.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/contacts?')) {
        return Promise.reject(
          new ApiClientError({
            message: 'limit must not be greater than 100',
            statusCode: 400,
          }),
        );
      }
      return Promise.resolve([] as never);
    });

    renderModal();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Relaties laden mislukt: limit must not be greater than 100',
    );
    // De retry-knop is aanwezig.
    expect(
      screen.getByRole('button', { name: 'Opnieuw proberen' }),
    ).toBeInTheDocument();
  });

  it('toont géén foutmelding wanneer de relatie-query slaagt', async () => {
    mockedGet.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/contacts?')) {
        return Promise.resolve({
          data: [
            {
              id: 'c1',
              type: 'COMPANY',
              companyName: 'Acme BV',
            },
          ],
          total: 1,
          page: 1,
          limit: 200,
        } as never);
      }
      return Promise.resolve([] as never);
    });

    renderModal();

    // Wacht tot de optie uit de geladen data zichtbaar is …
    expect(await screen.findByText('Acme BV')).toBeInTheDocument();
    // … en er géén foutstate staat.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// Los van de component: het contract dat de modal met limit=200 blijft vragen
// (de API-basiscap is hierop afgestemd; zie apps/api common/dto/pagination-query.dto.ts).
describe('CreateContactPersonModal — paginatie-contract', () => {
  const mockedGet = vi.mocked(apiClient.get);

  it('vraagt de relatielijst op met limit=200', async () => {
    mockedGet.mockResolvedValue({ data: [], total: 0, page: 1, limit: 200 } as never);

    renderModal();

    await vi.waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(
        expect.stringContaining('/contacts?limit=200'),
      );
    });
  });
});
