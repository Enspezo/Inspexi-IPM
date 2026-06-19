// PDF-preview van een gegenereerd document (POST /generated-documents/:id/preview).
// Authenticated blob-fetch → blob-URL in een <iframe>, met cleanup bij sluiten.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Spinner } from '@/components/ui';
import { previewDocumentPdf } from '../hooks/use-generated-documents';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  title?: string;
}

export function DocumentPreviewModal({ isOpen, onClose, documentId, title }: DocumentPreviewModalProps) {
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
    previewDocumentPdf(documentId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setPdfUrl(url);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('PDF-voorbeeld kon niet worden geladen');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, documentId]);

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

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="flex w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl"
        style={{ height: 'min(90vh, 1000px)' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title ?? 'Voorbeeld'}</h2>
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

        <div className="min-h-0 flex-1">
          {isLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-gray-500">PDF wordt gegenereerd...</p>
            </div>
          )}
          {error && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-sm text-gray-600">{error}</p>
              <button onClick={handleClose} className="text-sm font-medium text-primary-600 hover:text-primary-800">
                Sluiten
              </button>
            </div>
          )}
          {pdfUrl && <iframe src={pdfUrl} className="h-full w-full rounded-b-xl" title="PDF-voorbeeld" />}
        </div>
      </div>
    </div>
  );
}
