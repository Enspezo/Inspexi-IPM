import { useState } from 'react';
import {
  Button,
  ErrorBox,
  Spinner,
  Table,
  useConfirm,
  useToast,
  type Column,
} from '@/components/ui';
import { formatShortDate } from '@/lib/format';
import { downloadCalibrationDocument } from '@/lib/download-file';
import { getErrorMessage } from '@/lib/api-client';
import type { Calibration } from '@/types';
import { useCalibrations, useDeleteCalibration } from '../hooks/use-calibrations';
import { CalibrationFormModal } from './calibration-form-modal';
import { CalibrationPreviewModal } from './calibration-preview-modal';

interface KalibratiesTabProps {
  instrumentId: string;
  canEdit: boolean;
}

export function KalibratiesTab({ instrumentId, canEdit }: KalibratiesTabProps) {
  const { data, isLoading, error } = useCalibrations(instrumentId);
  const deleteMutation = useDeleteCalibration(instrumentId);
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<Calibration | null>(null);
  const [previewing, setPreviewing] = useState<Calibration | null>(null);

  const calibrations = data ?? [];

  const handleDownload = async (cal: Calibration) => {
    try {
      await downloadCalibrationDocument(instrumentId, cal.id, cal.originalName ?? 'certificaat');
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const handleDelete = async (cal: Calibration) => {
    const ok = await confirm({
      title: 'Kalibratie verwijderen',
      message: `Weet je zeker dat je de kalibratie van ${formatShortDate(cal.calibrationDate)} wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(cal.id);
      showToast('Kalibratie verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const columns: Column<Calibration>[] = [
    {
      key: 'calibrationDate',
      header: 'Kalibratiedatum',
      render: (c) => <span className="font-medium text-gray-900">{formatShortDate(c.calibrationDate)}</span>,
    },
    { key: 'performedBy', header: 'Uitvoerende instantie', render: (c) => c.performedBy },
    { key: 'certificateNumber', header: 'Certificaatnr.', render: (c) => c.certificateNumber || '—' },
    {
      key: 'document',
      header: 'Certificaat',
      render: (c) =>
        c.hasDocument ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewing(c)}
              className="inline-flex items-center gap-1 font-medium text-primary-600 hover:text-primary-800 hover:underline"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Bekijken
            </button>
            <button
              type="button"
              onClick={() => handleDownload(c)}
              title="Downloaden"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
  ];

  if (canEdit) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setEditing(c)}
            title="Bewerken"
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleDelete(c)}
            disabled={deleteMutation.isPending}
            title="Verwijderen"
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <ErrorBox>Kon de kalibraties niet laden.</ErrorBox>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {calibrations.length} {calibrations.length === 1 ? 'kalibratie' : 'kalibraties'}
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setIsAddOpen(true)}>
            Kalibratie toevoegen
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        data={calibrations}
        keyExtractor={(c) => c.id}
        emptyMessage="Nog geen kalibraties vastgelegd."
      />

      <CalibrationFormModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        instrumentId={instrumentId}
      />
      <CalibrationFormModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        instrumentId={instrumentId}
        calibration={editing}
      />
      <CalibrationPreviewModal
        isOpen={!!previewing}
        onClose={() => setPreviewing(null)}
        instrumentId={instrumentId}
        calibration={previewing}
      />
    </div>
  );
}
