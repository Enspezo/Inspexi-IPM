import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { formatFileSize } from '@/lib/format';
import { getErrorMessage } from '@/lib/api-client';
import type { Calibration } from '@/types';
import { useInstrumentSuggestions } from '../hooks/use-meetmiddelen';
import {
  useCreateCalibration,
  useUpdateCalibration,
  useDeleteCalibrationDocument,
  type CalibrationFormValues,
} from '../hooks/use-calibrations';

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp,image/svg+xml';

const schema = z.object({
  calibrationDate: z.string().min(1, 'Kalibratiedatum is verplicht'),
  performedBy: z.string().min(1, 'Uitvoerende instantie is verplicht').max(200, 'Maximaal 200 tekens'),
  certificateNumber: z.string().max(120, 'Maximaal 120 tekens').optional(),
  notes: z.string().max(2000, 'Maximaal 2000 tekens').optional(),
});

type FormData = z.infer<typeof schema>;

interface CalibrationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrumentId: string;
  /** Aanwezig = bewerk-modus. */
  calibration?: Calibration | null;
}

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function CalibrationFormModal({
  isOpen,
  onClose,
  instrumentId,
  calibration,
}: CalibrationFormModalProps) {
  const { showToast } = useToast();
  const isEdit = !!calibration;

  const createMutation = useCreateCalibration(instrumentId);
  const updateMutation = useUpdateCalibration(instrumentId);
  const removeDocMutation = useDeleteCalibrationDocument(instrumentId);
  const { data: performerSuggestions } = useInstrumentSuggestions('performedBy');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { calibrationDate: '', performedBy: '', certificateNumber: '', notes: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    reset({
      calibrationDate: toDateInput(calibration?.calibrationDate),
      performedBy: calibration?.performedBy ?? '',
      certificateNumber: calibration?.certificateNumber ?? '',
      notes: calibration?.notes ?? '',
    });
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen, calibration, reset]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFileError('');
    if (selected && selected.size > MAX_SIZE) {
      setFileError(`Bestand is te groot (max ${formatFileSize(MAX_SIZE)})`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(selected);
  };

  const onSubmit = async (data: FormData) => {
    const values: CalibrationFormValues = { ...data, file };
    try {
      if (isEdit && calibration) {
        await updateMutation.mutateAsync({ calId: calibration.id, values });
        showToast('Kalibratie bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync(values);
        showToast('Kalibratie toegevoegd', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleRemoveExistingDocument = async () => {
    if (!calibration) return;
    try {
      await removeDocMutation.mutateAsync(calibration.id);
      showToast('Certificaat verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Kalibratie bewerken' : 'Kalibratie toevoegen'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Kalibratiedatum"
            type="date"
            error={errors.calibrationDate?.message}
            {...register('calibrationDate')}
          />
          <Input
            label="Certificaatnummer"
            placeholder="optioneel"
            error={errors.certificateNumber?.message}
            {...register('certificateNumber')}
          />
        </div>

        <div>
          <Input
            label="Uitvoerende instantie"
            list="calibration-performer-suggestions"
            placeholder="bv. KalibratieLab BV"
            error={errors.performedBy?.message}
            {...register('performedBy')}
          />
          <datalist id="calibration-performer-suggestions">
            {(performerSuggestions ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Notitie</label>
          <textarea
            rows={2}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="optioneel"
            {...register('notes')}
          />
          {errors.notes && <p className="mt-1 text-xs text-red-600">{errors.notes.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Kalibratiecertificaat</label>
          {isEdit && calibration?.hasDocument && !file && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span className="truncate text-gray-700">{calibration.originalName}</span>
              <button
                type="button"
                onClick={handleRemoveExistingDocument}
                disabled={removeDocMutation.isPending}
                className="ml-2 shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
              >
                Verwijderen
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
          />
          {file && (
            <p className="mt-1 text-xs text-gray-500">
              {file.name} ({formatFileSize(file.size)})
            </p>
          )}
          {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
          <p className="mt-1 text-xs text-gray-400">
            {isEdit && calibration?.hasDocument
              ? 'Een nieuw bestand vervangt het huidige certificaat. '
              : ''}
            Toegestaan: PDF, JPEG, PNG, WebP, SVG (max 25 MB).
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
