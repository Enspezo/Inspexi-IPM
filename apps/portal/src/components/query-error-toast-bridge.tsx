import { useEffect } from 'react';
import { useToast } from '@/components/ui';
import { registerQueryErrorToaster } from '@/lib/query-error-toast';

/**
 * Verbindt de toast-context (ín React) met de globale QueryCache.onError
 * (búiten React, zie lib/query-error-toast.ts). Rendert niets; moet binnen
 * <ToastProvider> gemount staan (main.tsx).
 */
export function QueryErrorToastBridge() {
  const { showToast } = useToast();

  useEffect(() => {
    registerQueryErrorToaster(showToast);
    return () => registerQueryErrorToaster(null);
  }, [showToast]);

  return null;
}
