import { useState } from 'react';
import { Modal, Button, Input, ErrorBox } from '@/components/ui';
import { useCreateReinspection } from '../hooks/use-requests';
import { getErrorMessage } from '@/lib/api-client';

interface ReinspectionRequestModalProps {
  inspectionPlanId: string;
  projectName: string;
  onClose: () => void;
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function ReinspectionRequestModal({
  inspectionPlanId,
  projectName,
  onClose,
}: ReinspectionRequestModalProps) {
  const create = useCreateReinspection();
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (description.trim().length < 10) {
      setFieldError('Omschrijving moet minimaal 10 tekens bevatten.');
      return;
    }
    setFieldError(null);
    setError(null);
    try {
      await create.mutateAsync({
        inspectionPlanId,
        description: description.trim(),
        preferredDate: preferredDate || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Verzoek indienen mislukt'));
    }
  };

  return (
    <Modal isOpen title="Herinspectie aanvragen" onClose={onClose}>
      {success ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50">
            <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Verzoek ingediend</h3>
            {/* B-403 (WP-B9): eerlijke bevestiging — het verzoek wordt per e-mail aan
                de organisatie gemeld (stafwachtrij bestaat nog niet, Epic 2). */}
            <p className="mt-1 text-sm text-gray-600">
              Uw herinspectie-aanvraag voor {projectName} is ontvangen en per e-mail aan de
              organisatie doorgegeven. Wij nemen contact met u op.
            </p>
          </div>
          <Button className="w-full" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Gerelateerde inspectie</p>
            <p className="text-sm font-medium text-gray-900">{projectName}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Reden voor herinspectie</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Beschrijf waarom u een herinspectie wilt aanvragen…"
              className="block w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            {fieldError ? (
              <p className="mt-1 text-sm text-danger-600">{fieldError}</p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">Minimaal 10 tekens</p>
            )}
          </div>

          <Input
            type="date"
            label="Voorkeursdatum (optioneel)"
            min={tomorrow()}
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
          />

          <ErrorBox>{error}</ErrorBox>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button onClick={handleSubmit} isLoading={create.isPending}>
              Verzoek indienen
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
