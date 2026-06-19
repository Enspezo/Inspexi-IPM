import { useState } from 'react';
import { Modal, Button, Input, Checkbox, ErrorBox, SignatureCanvas } from '@/components/ui';
import { useClientAuth } from '@/providers/client-auth-provider';
import { useSignDocument } from '@/pages/documents/hooks/use-documents';
import { getErrorMessage } from '@/lib/api-client';
import { documentTypeLabel } from '@/lib/labels';

interface SignatureModalProps {
  documentId: string;
  documentType: string;
  projectName: string;
  onClose: () => void;
  onSuccess: () => void;
}

/** Ondertekenen van een klant-document: handtekening (canvas) + naam + akkoord → POST …/sign. */
export function SignatureModal({
  documentId,
  documentType,
  projectName,
  onClose,
  onSuccess,
}: SignatureModalProps) {
  const { user } = useClientAuth();
  const sign = useSignDocument(documentId);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(user ? `${user.firstName} ${user.lastName}` : '');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSign = !!signatureImage && signerName.trim().length > 0 && agreed && !sign.isPending;

  const handleSign = async () => {
    if (!signatureImage) return;
    setError(null);
    try {
      await sign.mutateAsync({ signatureImage, signerName: signerName.trim() });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Ondertekenen mislukt'));
    }
  };

  return (
    <Modal isOpen title="Document ondertekenen" onClose={success ? onSuccess : onClose}>
      {success ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50">
            <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Handtekening geplaatst</h3>
            <p className="mt-1 text-sm text-gray-600">Uw handtekening is succesvol vastgelegd.</p>
          </div>
          <Button className="w-full" onClick={onSuccess}>
            Sluiten
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {documentTypeLabel(documentType)} — <span className="font-medium text-gray-900">{projectName}</span>
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Handtekening</label>
            <SignatureCanvas onSave={(dataUrl) => setSignatureImage(dataUrl)} />
            {signatureImage && (
              <p className="mt-1 text-xs font-medium text-success-600">✓ Handtekening vastgelegd</p>
            )}
          </div>

          <Input
            label="Naam ondertekenaar"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Uw volledige naam"
          />

          <Checkbox
            label="Ik ga akkoord met de inhoud van dit document en bevestig mijn handtekening."
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />

          <ErrorBox>{error}</ErrorBox>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button onClick={handleSign} disabled={!canSign} isLoading={sign.isPending}>
              Ondertekenen
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
