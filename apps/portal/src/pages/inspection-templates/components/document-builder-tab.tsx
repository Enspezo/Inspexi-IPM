// ===========================================
// DocumentBuilderTab — host voor de block-editor (plan/rapport)
// ===========================================
//
// Laadt de plan- of rapport-DocumentTemplate, host de DocumentBuilder, slaat
// contentBlocks op (templateMode = BLOCKS) en toont de Fase 4 HTML-preview.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ErrorBox, Spinner, useToast, useConfirm } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { DocumentType, TemplateMode } from '@/types';
import { DocumentBuilder, type DocContentBlock } from '@/components/document-builder';
import {
  useDocumentTemplate,
  useUpdateDocumentTemplate,
  useDocumentTemplatePreview,
} from '../hooks/use-document-templates';

interface DocumentBuilderTabProps {
  inspectionTemplateId: string;
  canManage: boolean;
}

/** Normaliseer ruwe JSON-blocks naar een veilige DocContentBlock[]. */
function normalizeBlocks(raw: unknown[] | null | undefined): DocContentBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map((b, idx): DocContentBlock => ({
      id: typeof b.id === 'string' ? b.id : crypto.randomUUID(),
      type: (b.type as DocContentBlock['type']) ?? 'rich_text',
      width: b.width === 'half' ? 'half' : 'full',
      order: typeof b.order === 'number' ? b.order : idx,
      content: (b.content as DocContentBlock['content']) ?? {},
    }))
    .sort((a, b) => a.order - b.order)
    .map((b, idx) => ({ ...b, order: idx }));
}

const DOC_TYPES: { key: DocumentType; label: string }[] = [
  { key: DocumentType.PLAN, label: 'Inspectieplan' },
  { key: DocumentType.REPORT, label: 'Rapport' },
];

export function DocumentBuilderTab({ inspectionTemplateId, canManage }: DocumentBuilderTabProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [docType, setDocType] = useState<DocumentType>(DocumentType.PLAN);
  const [blocks, setBlocks] = useState<DocContentBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data: docTemplate, isLoading, error } = useDocumentTemplate(inspectionTemplateId, docType);
  const updateMutation = useUpdateDocumentTemplate(inspectionTemplateId, docType);
  const previewMutation = useDocumentTemplatePreview(inspectionTemplateId, docType);

  // Seed lokale blocks per template-versie (id + updatedAt). De stamp-guard
  // voorkomt dat een achtergrond-refetch (bijv. bij window-focus) tijdens het
  // bewerken de wijzigingen overschrijft; na een echte save verandert updatedAt
  // en wordt opnieuw geseed met de (genormaliseerde) serverdata.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!docTemplate) return;
    const stamp = `${docTemplate.id}:${docTemplate.updatedAt}`;
    if (seededRef.current === stamp) return;
    seededRef.current = stamp;
    setBlocks(normalizeBlocks(docTemplate.contentBlocks));
    setIsDirty(false);
  }, [docTemplate]);

  const isDocxMode = docTemplate?.templateMode === TemplateMode.DOCX;

  const handleSwitchType = async (next: DocumentType) => {
    if (next === docType) return;
    if (isDirty) {
      const ok = await confirm({
        title: 'Niet-opgeslagen wijzigingen',
        message: 'Je hebt wijzigingen die nog niet zijn opgeslagen. Weet je zeker dat je wilt wisselen? De wijzigingen gaan verloren.',
        confirmLabel: 'Wisselen',
      });
      if (!ok) return;
    }
    setShowPreview(false);
    setDocType(next);
  };

  const handleBlocksChange = (next: DocContentBlock[]) => {
    setBlocks(next);
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ templateMode: TemplateMode.BLOCKS, contentBlocks: blocks });
      showToast('Document-template opgeslagen', 'success');
      setIsDirty(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  const runPreview = () => {
    setShowPreview(true);
    previewMutation.mutate();
  };

  const handlePreview = async () => {
    // De preview rendert de laatst opgeslagen versie (server-side). Bied aan
    // eerst op te slaan zodat het voorbeeld de huidige wijzigingen toont.
    if (isDirty && canManage) {
      const ok = await confirm({
        title: 'Eerst opslaan?',
        message: 'Het voorbeeld toont de laatst opgeslagen versie. Wil je de wijzigingen eerst opslaan?',
        confirmLabel: 'Opslaan & voorbeeld',
        cancelLabel: 'Toon opgeslagen versie',
        variant: 'primary',
      });
      if (ok) {
        await handleSave();
      }
    }
    runPreview();
  };

  const docTypeLabel = useMemo(
    () => DOC_TYPES.find((d) => d.key === docType)?.label ?? '',
    [docType],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Plan / rapport toggle */}
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
          {DOC_TYPES.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => handleSwitchType(d.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                docType === d.key ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</span>}
          <Button variant="secondary" size="sm" onClick={handlePreview} disabled={previewMutation.isPending}>
            Voorbeeld
          </Button>
          {canManage && (
            <Button size="sm" onClick={handleSave} disabled={!isDirty} isLoading={updateMutation.isPending}>
              Opslaan
            </Button>
          )}
        </div>
      </div>

      {!canManage && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Je hebt geen rechten om dit template te bewerken (alleen-lezen). Bewerken kan door een
          beheerder zolang de inspectie-template de status <strong>Concept</strong> heeft.
        </p>
      )}

      {isDocxMode && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Dit {docTypeLabel.toLowerCase()}-template staat op <strong>Word-modus</strong>
          {docTemplate?.docxFileName ? ` (${docTemplate.docxFileName})` : ''}. Opslaan in de builder
          schakelt het template over naar <strong>block-modus</strong>.
        </p>
      )}

      {/* Inhoud */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <ErrorBox>Fout bij laden van het {docTypeLabel.toLowerCase()}-template: {(error as Error).message}</ErrorBox>
      ) : showPreview ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Voorbeeld — {docTypeLabel}</h3>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={runPreview} disabled={previewMutation.isPending}>
                Vernieuwen
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowPreview(false)}>
                Terug naar editor
              </Button>
            </div>
          </div>
          {previewMutation.isPending ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : previewMutation.error ? (
            <ErrorBox>Voorbeeld kon niet geladen worden</ErrorBox>
          ) : (
            <iframe
              srcDoc={previewMutation.data ?? ''}
              title={`Voorbeeld ${docTypeLabel}`}
              className="h-[70vh] w-full rounded-lg border border-gray-200 bg-white"
            />
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50/40 px-4 pb-4">
          <DocumentBuilder blocks={blocks} onChange={handleBlocksChange} isReadOnly={!canManage} />
        </div>
      )}
    </div>
  );
}
