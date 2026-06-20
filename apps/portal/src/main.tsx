import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider } from '@/providers/tenant-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { QuickCreateProvider } from '@/providers/quick-create-provider';
import { registerGlobalErrorReporter } from '@/lib/global-error-reporter';
import App from './App';
import './styles/index.css';

registerGlobalErrorReporter();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>
                <QuickCreateProvider>
                  <App />
                </QuickCreateProvider>
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </TenantProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
