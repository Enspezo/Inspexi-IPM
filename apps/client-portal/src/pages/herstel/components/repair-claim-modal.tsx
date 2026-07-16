import { useRef, useState } from 'react';
import { Modal, Button, ErrorBox, PhotoUploader } from '@/components/ui';
import { ApiClientError, getErrorMessage } from '@/lib/api-client';
import {
  useClaimFinding,
  useInvalidateRepairSession,
  useUploadResolutionPhotos,
} from '../hooks/use-repair';
import type { RepairFindingView } from '@/types';

interface RepairClaimModalProps {
  finding: RepairFindingView;
  onClose: () => void;
}

/**
 * Herstelmodal (PRD §14.9.3): werkzaamheden-omschrijving (verplicht) + minimaal
 * 1 bewijsfoto (client-side afgedwongen; server-side nogmaals bij het afronden).
 *
 * Flow: claim (first-wins) → foto-upload → overzicht refetchen → sluiten.
 * Bij een 409 (verloren race) is de invoer server-side bewaard als CONFLICT-
 * concept: we uploaden de foto's alsnog bij dat concept (bewijs voor de
 * conflictmelding), tonen de servermelding en refetchen zodat de kaart grijs wordt.
 */
export function RepairClaimModal({ finding, onClose }: RepairClaimModalProps) {
  const claim = useClaimFinding();
  const upload = useUploadResolutionPhotos();
  const invalidate = useInvalidateRepairSession();

  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Bij een gefaalde foto-upload ná een gelukte claim mag de claim niet herhaald
  // worden (server geeft dan 400 "al gemeld") — opnieuw proberen uploadt alleen.
  const claimed = useRef(false);

  const busy = claim.isPending || upload.isPending;
  const canSubmit = description.trim().length > 0 && files.length >= 1 && !busy;

  const handleSubmit = async () => {
    setError(null);
    try {
      if (!claimed.current) {
        await claim.mutateAsync({ findingId: finding.id, description: description.trim() });
        claimed.current = true;
      }
      await upload.mutateAsync({ findingId: finding.id, files });
      invalidate();
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.statusCode === 409) {
        // Verloren race: concept is bewaard — foto's best-effort bij het concept voegen.
        try {
          await upload.mutateAsync({ findingId: finding.id, files });
        } catch {
          // Best effort — het conflict-concept blijft ook zonder foto's bewaard.
        }
        setConflictMessage(
          getErrorMessage(
            err,
            'Deze constatering is zojuist al door een andere partij hersteld gemeld.',
          ),
        );
        invalidate();
      } else if (claimed.current) {
        setError(
          `${getErrorMessage(err, 'Foto-upload mislukt')} — uw melding is al geregistreerd; probeer de foto's opnieuw te versturen.`,
        );
      } else {
        setError(getErrorMessage(err, 'Melden mislukt'));
      }
    }
  };

  if (conflictMessage) {
    return (
      <Modal isOpen title="Al hersteld gemeld" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-lg bg-warning-50 px-3 py-3 text-sm text-warning-600" role="alert">
            {conflictMessage}
          </div>
          <Button size="lg" className="w-full" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      </Modal>
    );
  }

  if (success) {
    return (
      <Modal isOpen title="Herstel gemeld" onClose={onClose}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50">
            <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Hersteld gemeld</h3>
            <p className="mt-1 text-sm text-gray-600">
              De constatering staat nu als hersteld. Vergeet niet om af te ronden met de
              herstelverklaring zodra u klaar bent.
            </p>
          </div>
          <Button size="lg" className="w-full" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen title="Herstel melden" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3">
          {finding.normReference && (
            <p className="text-xs font-semibold text-gray-700">{finding.normReference}</p>
          )}
          <p className="text-sm text-gray-900">
            <span className="font-semibold">#{finding.seq}</span> {finding.shortDescription}
          </p>
        </div>

        <div>
          <label htmlFor="repair-description" className="mb-1.5 block text-sm font-medium text-gray-700">
            Uitgevoerde werkzaamheden <span className="text-danger-600">*</span>
          </label>
          <textarea
            id="repair-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Beschrijf welke herstelwerkzaamheden zijn uitgevoerd…"
            className="block w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Bewijsfoto's <span className="text-danger-600">*</span>
          </label>
          <PhotoUploader files={files} onChange={setFiles} maxFiles={5} maxSizeMb={5} />
          {files.length === 0 && (
            <p className="mt-1.5 text-xs text-gray-500">Minimaal één foto is verplicht.</p>
          )}
        </div>

        <ErrorBox>{error}</ErrorBox>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuleren
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={busy}>
            Herstel melden
          </Button>
        </div>
      </div>
    </Modal>
  );
}
