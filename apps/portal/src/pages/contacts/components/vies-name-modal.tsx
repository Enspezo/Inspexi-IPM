import { Button, Modal } from '@/components/ui';

export function ViesNameModal({
  suggestion,
  currentName,
  onClose,
  onApply,
}: {
  suggestion: string | null;
  currentName: string | undefined;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <Modal
      isOpen={suggestion !== null}
      onClose={onClose}
      title="Bedrijfsnaam bijwerken?"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          De naam in het BTW-register (VIES) verschilt van de huidige bedrijfsnaam:
        </p>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
          <div>
            <span className="font-medium text-gray-500">Huidige naam: </span>
            <span className="text-gray-900">{currentName || '—'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Naam in VIES: </span>
            <span className="text-gray-900 font-medium">{suggestion}</span>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Wil je de bedrijfsnaam overschrijven met de naam uit VIES?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Nee, behouden
          </Button>
          <Button onClick={onApply}>
            Ja, bijwerken
          </Button>
        </div>
      </div>
    </Modal>
  );
}
