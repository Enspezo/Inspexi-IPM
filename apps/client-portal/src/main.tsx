import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { z } from 'zod';
import { TenantProvider } from '@/providers/tenant-provider';
import { ClientAuthProvider } from '@/providers/client-auth-provider';
import { FeatureProvider } from '@/providers/feature-provider';
import { ConfirmProvider, ToastProvider, ErrorBoundary } from '@/components/ui';
import { nlErrorMap } from '@/lib/zod-error-map';
import App from './App';
import './styles/index.css';

// Nederlandse zod-defaults (WP-C1 / B-501) — expliciete messages blijven leidend.
z.setErrorMap(nlErrorMap);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <ClientAuthProvider>
            <FeatureProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <ErrorBoundary>
                    <App />
                  </ErrorBoundary>
                </ConfirmProvider>
              </ToastProvider>
            </FeatureProvider>
          </ClientAuthProvider>
        </TenantProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
