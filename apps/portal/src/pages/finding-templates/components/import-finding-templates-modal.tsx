// Import-modal: upload een JSON-bestand of plak JSON. We parsen client-side naar de
// importpayload { exportVersion, findingTemplates[] } (zelfde shape als de export) en
// tonen na afloop het resultaat (geïmporteerd / overgeslagen / fouten).

import { useEffect, useRef, useState } from 'react';
import { Modal, Button, ErrorBox, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import {
  useImportFindingTemplates,
  type FindingTemplateExportItem,
  type ImportFindingTemplatesResult,
} from '../hooks/use-finding-templates';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Bouw een importpayload uit willekeurige geparste JSON. Accepteert het export-formaat. */
function buildPayload(parsed: unknown): { exportVersion: string; findingTemplates: FindingTemplateExportItem[] } {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON moet een object met een "findingTemplates" array zijn');
  }
  const obj = parsed as Record<string, unknown>;
  const list = obj.findingTemplates;
  if (!Array.isArray(list)) {
    throw new Error('Veld "findingTemplates" ontbreekt of is geen array');
  }
  const exportVersion = typeof obj.exportVersion === 'string' ? obj.exportVersion : '1.0';
  return { exportVersion, findingTemplates: list as FindingTemplateExportItem[] };
}

export function ImportFindingTemplatesModal({ isOpen, onClose }: Props) {
  const { showToast } = useToast();
  const importMutation = useImportFindingTemplates();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportFindingTemplatesResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setJsonText('');
      setParseError(null);
      setResult(null);
    }
  }, [isOpen]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    try {
      const text = await file.text();
      setJsonText(text);
    } catch {
      setParseError('Bestand kon niet worden gelezen');
    }
  };

  const handleImport = async () => {
    setParseError(null);
    setResult(null);
    let payload;
    try {
      const parsed = JSON.parse(jsonText);
      payload = buildPayload(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Ongeldige JSON');
      return;
    }
    if (payload.findingTemplates.length === 0) {
      setParseError('Geen sjablonen gevonden om te importeren');
      return;
    }
    try {
      const res = await importMutation.mutateAsync(payload);
      setResult(res);
      if (res.imported > 0) {
        showToast(`${res.imported} sjabloon(en) geïmporteerd`, 'success');
      } else {
        showToast('Geen sjablonen geïmporteerd', 'info');
      }
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Constateringen-templates importeren">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Upload een eerder geëxporteerd JSON-bestand of plak de inhoud hieronder. Sjablonen worden
          als eigen (org)-templates geïmporteerd; bestaande codes worden overgeslagen.
        </p>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">JSON</label>
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setParseError(null);
            }}
            rows={8}
            placeholder='{ "exportVersion": "1.0", "findingTemplates": [ ... ] }'
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        {parseError && <ErrorBox>{parseError}</ErrorBox>}

        {result && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <p className="font-medium text-gray-900">
              {result.imported} geïmporteerd · {result.skipped} overgeslagen
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1 text-gray-600">
                {result.errors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Sluiten
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            isLoading={importMutation.isPending}
            disabled={!jsonText.trim()}
          >
            Importeren
          </Button>
        </div>
      </div>
    </Modal>
  );
}
