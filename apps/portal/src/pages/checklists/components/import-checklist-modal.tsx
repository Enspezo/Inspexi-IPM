// Import-modal: plak JSON of upload een bestand (export-formaat van GET /checklists/:id/export).
// Verwachte shape (ImportChecklistDto): { exportVersion, checklist: { name, normTypeCode, assetTypes, ... }, items: [...] }.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, ErrorBox, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useImportChecklist } from '../hooks/use-checklists';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportChecklistModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const importMutation = useImportChecklist();
  const fileRef = useRef<HTMLInputElement>(null);

  const [json, setJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setJson('');
      setParseError(null);
    }
  }, [isOpen]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setJson(text);
    setParseError(null);
  };

  const handleImport = async () => {
    setParseError(null);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(json);
    } catch {
      setParseError('Ongeldige JSON — controleer de inhoud.');
      return;
    }
    if (!payload || typeof payload !== 'object' || !('checklist' in payload) || !('items' in payload)) {
      setParseError('JSON mist verplichte velden (checklist, items).');
      return;
    }
    try {
      const created = await importMutation.mutateAsync(payload);
      showToast('Checklist geïmporteerd', 'success');
      onClose();
      navigate(`/checklists/${created.id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Importeren mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Checklist importeren" className="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Plak hieronder de JSON-export van een checklist, of upload een geëxporteerd bestand.
        </p>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            Bestand kiezen
          </Button>
        </div>

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={12}
          placeholder='{ "exportVersion": "1.0", "checklist": { ... }, "items": [ ... ] }'
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-primary-500 focus:ring-primary-500"
        />

        {parseError && <ErrorBox>{parseError}</ErrorBox>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!json.trim()}
            isLoading={importMutation.isPending}
          >
            Importeren
          </Button>
        </div>
      </div>
    </Modal>
  );
}
