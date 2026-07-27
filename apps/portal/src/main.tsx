import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider } from '@/providers/tenant-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { FeatureProvider } from '@/providers/feature-provider';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { QueryErrorToastBridge } from '@/components/query-error-toast-bridge';
import { createAppQueryCache } from '@/lib/query-error-toast';
import { QuickCreateProvider } from '@/providers/quick-create-provider';
import { WindowTabsProvider } from '@/providers/window-tabs';
import { ChatProvider } from '@/providers/chat-provider';
import { HelpProvider } from '@/providers/help-provider';
import { registerGlobalErrorReporter } from '@/lib/global-error-reporter';
import App from './App';
import './styles/index.css';

registerGlobalErrorReporter();

const queryClient = new QueryClient({
  // Query-fouten nooit stil laten falen: console.error + (gededupte) toast
  // via de bridge in de ToastProvider (WP-B6 / B-305).
  queryCache: createAppQueryCache(),
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
            <FeatureProvider>
              <ToastProvider>
                <QueryErrorToastBridge />
                <ConfirmProvider>
                  <ChatProvider>
                    <HelpProvider>
                      <QuickCreateProvider>
                        <WindowTabsProvider>
                          <App />
                        </WindowTabsProvider>
                      </QuickCreateProvider>
                    </HelpProvider>
                  </ChatProvider>
                </ConfirmProvider>
              </ToastProvider>
            </FeatureProvider>
          </AuthProvider>
        </TenantProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
