import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TenantProvider } from '@/providers/tenant-provider';
import { FeatureProvider } from '@/providers/feature-provider';
import { ConfirmProvider, ToastProvider } from '@/components/ui';

/** Verse QueryClient per test — geen state-lek tussen tests. */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

interface WrapperOptions {
  initialRoute?: string;
}

/**
 * Render-helper met alle app-providers (zelfde patroon als apps/portal). De
 * TenantProvider fetcht niets in tests: hostname 'localhost' → geen slug →
 * branding-query disabled → FeatureProvider fail-open (features onbekend).
 */
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & WrapperOptions,
) {
  const { initialRoute = '/', ...renderOptions } = options ?? {};
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <TenantProvider>
            <FeatureProvider>
              <ToastProvider>
                <ConfirmProvider>{children}</ConfirmProvider>
              </ToastProvider>
            </FeatureProvider>
          </TenantProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

export { customRender as render };
export { screen, waitFor, within, fireEvent } from '@testing-library/react';
