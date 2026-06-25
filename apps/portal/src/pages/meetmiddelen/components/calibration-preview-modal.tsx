import { Button, useToast } from '@/components/ui';
import { FilePreviewModal, getMimeLabel } from '@/components/documents/file-preview-modal';
import { formatShortDate, formatFileSize } from '@/lib/format';
import { downloadCalibrationDocument } from '@/lib/download-file';
import { getErrorMessage } from '@/lib/api-client';
import type { Calibration } from '@/types';

interface CalibrationPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrumentId: string;
  calibration: Calibration | null;
}

/**
 * Preview van een kalibratiecertificaat. Hergebruikt dezelfde {@link FilePreviewModal}
 * als het DMS; levert alleen kalibratie-specifieke metadata aan de sidebar.
 */
export function CalibrationPreviewModal({
  isOpen,
  onClose,
  instrumentId,
  calibration: cal,
}: CalibrationPreviewModalProps) {
  const { showToast } = useToast();

  if (!isOpen || !cal || !cal.hasDocument || !cal.mimeType || !cal.originalName) {
    return null;
  }

  const handleDownload = async () => {
    try {
      await downloadCalibrationDocument(instrumentId, cal.id, cal.originalName ?? 'certificaat');
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const sidebar = (
    <>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
        Kalibratiegegevens
      </h3>

      <div className="space-y-4">
        <MetaField label="Kalibratiedatum" value={formatShortDate(cal.calibrationDate)} />
        <MetaField label="Uitvoerende instantie" value={cal.performedBy} />
        {cal.certificateNumber && <MetaField label="Certificaatnummer" value={cal.certificateNumber} />}
        {cal.notes && <MetaField label="Notitie" value={cal.notes} />}

        <div className="space-y-4 border-t border-gray-200 pt-4">
          <MetaField label="Bestandsnaam" value={cal.originalName} />
          <MetaField label="Type" value={getMimeLabel(cal.mimeType)} />
          {cal.size != null && <MetaField label="Grootte" value={formatFileSize(cal.size)} />}
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
    <FilePreviewModal
      isOpen={isOpen}
      onClose={onClose}
      downloadPath={`/measurement-instruments/${instrumentId}/calibrations/${cal.id}/document`}
      fileName={cal.originalName}
      mimeType={cal.mimeType}
      sidebar={sidebar}
    />
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
