import { useState } from 'react';
import { Modal, Button, SignatureCanvas, useToast } from '@/components/ui';
import { useApproveQuote } from '../hooks/use-quotes';

interface ApproveQuoteModalProps {
  quoteId: string;
  quoteNumber: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ApproveQuoteModal({ quoteId, quoteNumber, isOpen, onClose }: ApproveQuoteModalProps) {
  const { showToast } = useToast();
  const approveMutation = useApproveQuote(quoteId);

  const [note, setNote] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync({
        note: note.trim() || undefined,
        managerSignature: signature ?? undefined,
      });
      showToast('Offerte goedgekeurd', 'success');
      onClose();
    } catch {
      showToast('Goedkeuren mislukt', 'error');
    }
  };

  const handleClose = () => {
    setNote('');
    setSignature(null);
    setShowCanvas(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Offerte ${quoteNumber} goedkeuren`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Bevestig dat u offerte <strong>{quoteNumber}</strong> goedkeurt. U kunt optioneel een notitie en uw handtekening toevoegen.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notitie (optioneel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Eventuele opmerking bij goedkeuring..."
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Handtekening (optioneel)</label>
            {!showCanvas && !signature && (
              <button
                type="button"
                onClick={() => setShowCanvas(true)}
                className="text-xs text-primary-600 hover:text-primary-800 underline"
              >
                Handtekening toevoegen
              </button>
            )}
          </div>

          {signature ? (
            <div className="space-y-2">
              <img
                src={signature}
                alt="Handtekening"
                className="border border-gray-200 rounded-lg max-h-24 w-full object-contain bg-white"
              />
              <button
                type="button"
                onClick={() => { setSignature(null); setShowCanvas(true); }}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                Handtekening wissen
              </button>
            </div>
          ) : showCanvas ? (
            <SignatureCanvas onSave={(dataUrl) => { setSignature(dataUrl); setShowCanvas(false); }} />
          ) : null}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={approveMutation.isPending}>
            Annuleren
          </Button>
          <Button onClick={handleApprove} isLoading={approveMutation.isPending}>
            Goedkeuren
          </Button>
        </div>
      </div>
    </Modal>
  );
}
