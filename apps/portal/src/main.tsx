import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider } from '@/providers/tenant-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { FeatureProvider } from '@/providers/feature-provider';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { QuickCreateProvider } from '@/providers/quick-create-provider';
import { WindowTabsProvider } from '@/providers/window-tabs';
import { ChatProvider } from '@/providers/chat-provider';
import { AiAgentProvider } from '@/providers/ai-agent-provider';
import { HelpProvider } from '@/providers/help-provider';
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
            <FeatureProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <ChatProvider>
                    <AiAgentProvider>
                      <HelpProvider>
                        <QuickCreateProvider>
                          <WindowTabsProvider>
                            <App />
                          </WindowTabsProvider>
                        </QuickCreateProvider>
                      </HelpProvider>
                    </AiAgentProvider>
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
