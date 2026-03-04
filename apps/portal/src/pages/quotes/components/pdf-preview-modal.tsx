import { useState, useEffect, useRef, useCallback } from 'react';
import { Spinner } from '@/components/ui';
import { previewQuotePdf } from '../hooks/use-quotes';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  quoteNumber?: string;
}

export function PdfPreviewModal({ isOpen, onClose, quoteId, quoteNumber }: PdfPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setError(null);
    setIsLoading(false);
    onClose();
  }, [pdfUrl, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);
    setPdfUrl(null);

    let cancelled = false;

    previewQuotePdf(quoteId)
      .then((url) => {
        if (!cancelled) {
          setPdfUrl(url);
          setIsLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('PDF voorbeeld kon niet worden geladen');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, quoteId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) handleClose();
  };

  const title = quoteNumber ? `Voorbeeld — Offerte ${quoteNumber}` : 'Voorbeeld';

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      style={{ animation: 'fade-in 0.15s ease-out' }}
    >
      <div
        className="w-full max-w-5xl rounded-xl bg-white shadow-xl flex flex-col"
        style={{ animation: 'fade-in 0.2s ease-out', height: 'min(90vh, 1000px)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-preview-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
          <h2 id="pdf-preview-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Sluiten"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-gray-500">PDF wordt gegenereerd...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <svg className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm text-gray-600">{error}</p>
              <button
                onClick={handleClose}
                className="text-sm text-primary-600 hover:text-primary-800 font-medium"
              >
                Sluiten
              </button>
            </div>
          )}

          {pdfUrl && (
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded-b-xl"
              title="PDF voorbeeld"
            />
          )}
        </div>
      </div>
    </div>
  );
}
