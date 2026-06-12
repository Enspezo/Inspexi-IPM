import { useState } from 'react';
import { Modal, Button, useToast } from '@/components/ui';
import { apiClient, getErrorMessage } from '@/lib/api-client';

interface ErrorReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export function ErrorReportModal({
  isOpen,
  onClose,
  error,
  errorInfo,
}: ErrorReportModalProps) {
  const { showToast } = useToast();
  const [userDescription, setUserDescription] = useState('');
  const [showTechnical, setShowTechnical] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await apiClient.post('/error-reports', {
        errorMessage: error?.message ?? 'Onbekende fout',
        stackTrace: error?.stack ?? null,
        componentStack: errorInfo?.componentStack ?? null,
        userDescription: userDescription.trim() || null,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
        },
      });

      showToast('Foutmelding succesvol verzonden. Bedankt!', 'success');
      setUserDescription('');
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Verzenden mislukt. Probeer het later opnieuw.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Probleem melden">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Beschrijf wat je aan het doen was toen de fout optrad. Je melding
          wordt doorgestuurd naar de helpdesk.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Wat was je aan het doen? <span className="text-gray-400">(optioneel)</span>
          </label>
          <textarea
            value={userDescription}
            onChange={(e) => setUserDescription(e.target.value)}
            rows={3}
            placeholder="Bijv. &quot;Ik probeerde een contact op te slaan...&quot;"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
            onClick={() => setShowTechnical((v) => !v)}
          >
            <span>Technische details</span>
            <span className="text-gray-400">{showTechnical ? '▲' : '▼'}</span>
          </button>
          {showTechnical && (
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Fout</p>
                <p className="text-xs text-gray-700 font-mono break-all">
                  {error?.message ?? 'Onbekende fout'}
                </p>
              </div>
              {error?.stack && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Stack trace</p>
                  <pre className="text-xs text-gray-600 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                    {error.stack}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Pagina</p>
                <p className="text-xs text-gray-700 font-mono break-all">
                  {window.location.href}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Melding versturen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
