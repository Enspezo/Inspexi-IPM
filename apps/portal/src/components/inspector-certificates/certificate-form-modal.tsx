import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { formatFileSize } from '@/lib/format';
import { getErrorMessage } from '@/lib/api-client';
import type { InspectorCertificate } from '@/types';
import {
  useCreateInspectorCertificate,
  useUpdateInspectorCertificate,
  useDeleteCertificateDocument,
  useCertificateSuggestions,
  type CertificateFormValues,
} from '@/pages/inspectors/hooks/use-inspector-certificates';

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/webp';

const schema = z.object({
  type: z.string().min(1, 'Soort is verplicht').max(200, 'Maximaal 200 tekens'),
  number: z.string().max(120, 'Maximaal 120 tekens').optional(),
  issueDate: z.string().min(1, 'Datum van afgifte is verplicht'),
  validUntil: z.string().optional(),
  issuer: z.string().min(1, 'Instantie is verplicht').max(200, 'Maximaal 200 tekens'),
});

type FormData = z.infer<typeof schema>;

interface CertificateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  /** Aanwezig = bewerk-modus. */
  certificate?: InspectorCertificate | null;
}

/** Een ISO-datetime/-datum afsnijden tot yyyy-MM-dd voor een `<input type="date">`. */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function CertificateFormModal({
  isOpen,
  onClose,
  userId,
  certificate,
}: CertificateFormModalProps) {
  const { showToast } = useToast();
  const isEdit = !!certificate;

  const createMutation = useCreateInspectorCertificate();
  const updateMutation = useUpdateInspectorCertificate();
  const removeDocMutation = useDeleteCertificateDocument();
  const { data: typeSuggestions } = useCertificateSuggestions('type');
  const { data: issuerSuggestions } = useCertificateSuggestions('issuer');

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
    defaultValues: { type: '', number: '', issueDate: '', validUntil: '', issuer: '' },
  });

  // (Her)vul het formulier zodra de modal opent of een ander certificaat krijgt.
  useEffect(() => {
    if (!isOpen) return;
    reset({
      type: certificate?.type ?? '',
      number: certificate?.number ?? '',
      issueDate: toDateInput(certificate?.issueDate),
      validUntil: toDateInput(certificate?.validUntil),
      issuer: certificate?.issuer ?? '',
    });
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen, certificate, reset]);

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
    const values: CertificateFormValues = { ...data, file };
    try {
      if (isEdit && certificate) {
        await updateMutation.mutateAsync({ id: certificate.id, values });
        showToast('Certificaat bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({ userId, values });
        showToast('Certificaat toegevoegd', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleRemoveExistingDocument = async () => {
    if (!certificate) return;
    try {
      await removeDocMutation.mutateAsync(certificate.id);
      showToast('Document verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Certificaat bewerken' : 'Certificaat toevoegen'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Input
            label="Soort"
            list="cert-type-suggestions"
            placeholder="bv. VCA-VOL"
            error={errors.type?.message}
            {...register('type')}
          />
          <datalist id="cert-type-suggestions">
            {(typeSuggestions ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <Input
            label="Instantie"
            list="cert-issuer-suggestions"
            placeholder="bv. VCA Examenbureau"
            error={errors.issuer?.message}
            {...register('issuer')}
          />
          <datalist id="cert-issuer-suggestions">
            {(issuerSuggestions ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Datum van afgifte"
            type="date"
            error={errors.issueDate?.message}
            {...register('issueDate')}
          />
          <Input
            label="Geldig tot"
            type="date"
            helperText="Leeg = geen einddatum"
            error={errors.validUntil?.message}
            {...register('validUntil')}
          />
        </div>

        <Input
          label="Nummer"
          placeholder="Certificaatnummer (optioneel)"
          error={errors.number?.message}
          {...register('number')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Document
          </label>
          {isEdit && certificate?.hasDocument && !file && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span className="truncate text-gray-700">{certificate.originalName}</span>
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
            {isEdit && certificate?.hasDocument
              ? 'Een nieuw bestand vervangt het huidige document. '
              : ''}
            Toegestaan: PDF, JPEG, PNG, WebP (max 25 MB).
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
