import { useState } from 'react';
import { Modal, Button, ErrorBox, PhotoUploader } from '@/components/ui';
import { useResolveFinding } from '../hooks/use-findings';
import { getErrorMessage } from '@/lib/api-client';
import type { FindingDetail } from '@/types';

interface ResolveFindingModalProps {
  finding: FindingDetail;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResolveFindingModal({ finding, onClose, onSuccess }: ResolveFindingModalProps) {
  const resolve = useResolveFinding(finding.id);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    try {
      await resolve.mutateAsync({ description, files });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Melden mislukt'));
    }
  };

  return (
    <Modal isOpen title="Als opgelost markeren" onClose={success ? onSuccess : onClose}>
      {success ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50">
            <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Gemeld als opgelost</h3>
            <p className="mt-1 text-sm text-gray-600">
              Een inspecteur controleert uw melding en koppelt terug.
            </p>
          </div>
          <Button className="w-full" onClick={onSuccess}>
            Sluiten
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3">
            {finding.normReference && (
              <p className="text-xs font-semibold text-gray-700">{finding.normReference}</p>
            )}
            <p className="text-sm text-gray-900">{finding.shortDescription}</p>
          </div>

          <div className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-600">
            Een inspecteur controleert uw melding voordat de constatering definitief als opgelost geldt.
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Toelichting (optioneel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Beschrijf welke herstelwerkzaamheden zijn uitgevoerd…"
              className="block w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Foto's (optioneel)</label>
            <PhotoUploader files={files} onChange={setFiles} maxFiles={5} maxSizeMb={5} />
          </div>

          <ErrorBox>{error}</ErrorBox>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button onClick={handleSubmit} isLoading={resolve.isPending}>
              Als opgelost melden
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
