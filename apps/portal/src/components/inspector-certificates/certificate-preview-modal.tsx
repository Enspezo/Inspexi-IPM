import { lazy, Suspense } from 'react';
import { Button, StatusBadge, Spinner, useToast } from '@/components/ui';
import { getMimeLabel } from '@/components/documents/file-preview-utils';

// Zware preview-renderer (docx-preview + xlsx) lazy laden.
const FilePreviewModal = lazy(() =>
  import('@/components/documents/file-preview-modal').then((m) => ({
    default: m.FilePreviewModal,
  })),
);
import { formatShortDate, formatFileSize } from '@/lib/format';
import { CERTIFICATE_VALIDITY, getCertificateValidityKey } from '@/lib/status';
import { downloadCertificateDocument } from '@/lib/download-file';
import { getErrorMessage } from '@/lib/api-client';
import type { InspectorCertificate } from '@/types';

interface CertificatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: InspectorCertificate | null;
}

/**
 * Preview van een certificaatbestand. Hergebruikt dezelfde {@link FilePreviewModal}
 * als het DMS; levert alleen certificaat-specifieke metadata aan de sidebar.
 */
export function CertificatePreviewModal({
  isOpen,
  onClose,
  certificate: cert,
}: CertificatePreviewModalProps) {
  const { showToast } = useToast();

  if (!isOpen || !cert || !cert.hasDocument || !cert.mimeType || !cert.originalName) {
    return null;
  }

  const handleDownload = async () => {
    try {
      await downloadCertificateDocument(cert.id, cert.originalName ?? 'certificaat');
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const sidebar = (
    <>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
        Certificaatgegevens
      </h3>

      <div className="space-y-4">
        <MetaField label="Soort" value={cert.type} />
        {cert.number && <MetaField label="Nummer" value={cert.number} />}
        <MetaField label="Instantie" value={cert.issuer} />
        <MetaField label="Datum van afgifte" value={formatShortDate(cert.issueDate)} />
        <div>
          <dt className="text-xs font-medium text-gray-500">Geldigheid</dt>
          <dd className="mt-1 flex items-center gap-2">
            <StatusBadge map={CERTIFICATE_VALIDITY} status={getCertificateValidityKey(cert.validUntil)} />
            {cert.validUntil && (
              <span className="text-sm text-gray-700">{formatShortDate(cert.validUntil)}</span>
            )}
          </dd>
        </div>

        <div className="space-y-4 border-t border-gray-200 pt-4">
          <MetaField label="Bestandsnaam" value={cert.originalName} />
          <MetaField label="Type" value={getMimeLabel(cert.mimeType)} />
          {cert.size != null && <MetaField label="Grootte" value={formatFileSize(cert.size)} />}
        </div>
      </div>

      <div className="mt-6">
        <Button className="w-full" onClick={handleDownload}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Downloaden
        </Button>
      </div>
    </>
  );

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Spinner size="lg" />
        </div>
      }
    >
      <FilePreviewModal
        isOpen={isOpen}
        onClose={onClose}
        downloadPath={`/inspector-certificates/${cert.id}/document`}
        fileName={cert.originalName}
        mimeType={cert.mimeType}
        sidebar={sidebar}
      />
    </Suspense>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900">{value}</dd>
    </div>
  );
}
