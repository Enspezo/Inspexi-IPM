// Documenten-tab van de inspectie-detailpagina: genereren, previewen,
// PDF/Word exporteren+downloaden, finaliseren en ondertekenverzoeken aanmaken.
// Alle endpoints bestaan al (generated-documents.controller); dit is enkel de UI.
import { useState } from 'react';
import {
  Button,
  Card,
  Spinner,
  StatusBadge,
  LookupBadge,
  useConfirm,
  useToast,
} from '@/components/ui';
import { GENERATED_DOCUMENT_STATUS, SIGNATURE_STATUS } from '@/lib/status';
import { DocumentType, GeneratedDocumentStatus, SignatureStatus } from '@/types';
import type { GeneratedDocument } from '@/types';
import { formatDateTime } from '@/lib/format';
import { getErrorMessage } from '@/lib/api-client';
import {
  useInspectionDocuments,
  useGenerateDocument,
  useExportDocumentPdf,
  useExportDocumentWord,
  useFinalizeDocument,
  useDeleteDocument,
  useRequestSignature,
  downloadDocument,
  type RequestSignatureInput,
} from '../hooks/use-generated-documents';
import { DocumentPreviewModal } from './document-preview-modal';
import { RequestSignatureModal } from './request-signature-modal';

const DOC_TYPE_LABEL: Record<string, string> = {
  [DocumentType.PLAN]: 'Inspectieplan',
  [DocumentType.REPORT]: 'Rapport',
};

interface DocumentsTabProps {
  planId: string;
  canWrite: boolean;
  canFinalize: boolean;
}

export function DocumentsTab({ planId, canWrite, canFinalize }: DocumentsTabProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: documents = [], isLoading } = useInspectionDocuments(planId);
  const generate = useGenerateDocument(planId);
  const exportPdf = useExportDocumentPdf(planId);
  const exportWord = useExportDocumentWord(planId);
  const finalize = useFinalizeDocument(planId);
  const deleteDoc = useDeleteDocument(planId);
  const requestSignature = useRequestSignature(planId);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [signatureDocId, setSignatureDocId] = useState<string | null>(null);
  // Per-actie loading-key: `${docId}:${actie}`.
  const [busy, setBusy] = useState<string | null>(null);

  const previewDoc = documents.find((d) => d.id === previewId);

  const handleGenerate = async (type: DocumentType) => {
    try {
      await generate.mutateAsync(type);
      showToast(`${DOC_TYPE_LABEL[type]} gegenereerd`, 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDownload = async (doc: GeneratedDocument, format: 'pdf' | 'word') => {
    const key = `${doc.id}:${format}`;
    setBusy(key);
    try {
      // Exporteer (persisteert het bestand) en stream het vervolgens naar de browser.
      if (format === 'pdf') await exportPdf.mutateAsync(doc.id);
      else await exportWord.mutateAsync(doc.id);
      const ext = format === 'pdf' ? 'pdf' : 'docx';
      const name = `${DOC_TYPE_LABEL[doc.documentType] ?? 'document'}-${doc.id.slice(0, 8)}.${ext}`;
      await downloadDocument(doc.id, format, name);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    } finally {
      setBusy(null);
    }
  };

  const handleFinalize = async (doc: GeneratedDocument) => {
    const ok = await confirm({
      title: 'Document finaliseren',
      message: 'Na finaliseren kan het document niet meer bewerkt of verwijderd worden. Doorgaan?',
      confirmLabel: 'Finaliseren',
    });
    if (!ok) return;
    try {
      await finalize.mutateAsync(doc.id);
      showToast('Document gefinaliseerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async (doc: GeneratedDocument) => {
    const ok = await confirm({
      title: 'Document verwijderen',
      message: `Weet je zeker dat je dit ${DOC_TYPE_LABEL[doc.documentType]?.toLowerCase()} wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteDoc.mutateAsync(doc.id);
      showToast('Document verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleRequestSignature = async (data: RequestSignatureInput) => {
    if (!signatureDocId) return;
    try {
      await requestSignature.mutateAsync({ id: signatureDocId, data });
      showToast('Ondertekenverzoek verstuurd', 'success');
      setSignatureDocId(null);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const generateActions = canWrite ? (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" onClick={() => handleGenerate(DocumentType.PLAN)} isLoading={generate.isPending}>
        Inspectieplan genereren
      </Button>
      <Button size="sm" variant="secondary" onClick={() => handleGenerate(DocumentType.REPORT)} isLoading={generate.isPending}>
        Rapport genereren
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <Card title="Documenten" actions={generateActions}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : documents.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">
            Nog geen documenten gegenereerd voor deze inspectie.
          </p>
        ) : (
          <ul className="-my-3 divide-y divide-gray-100">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                canWrite={canWrite}
                canFinalize={canFinalize}
                busy={busy}
                onPreview={() => setPreviewId(doc.id)}
                onDownload={(format) => handleDownload(doc, format)}
                onFinalize={() => handleFinalize(doc)}
                onRequestSignature={() => setSignatureDocId(doc.id)}
                onDelete={() => handleDelete(doc)}
                onCopyLink={(url) => {
                  navigator.clipboard?.writeText(url);
                  showToast('Link gekopieerd', 'success');
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewId}
          onClose={() => setPreviewId(null)}
          documentId={previewDoc.id}
          title={`Voorbeeld — ${DOC_TYPE_LABEL[previewDoc.documentType] ?? 'Document'}`}
        />
      )}

      <RequestSignatureModal
        isOpen={!!signatureDocId}
        onClose={() => setSignatureDocId(null)}
        isSubmitting={requestSignature.isPending}
        onSubmit={handleRequestSignature}
      />
    </>
  );
}

interface DocumentRowProps {
  doc: GeneratedDocument;
  canWrite: boolean;
  canFinalize: boolean;
  busy: string | null;
  onPreview: () => void;
  onDownload: (format: 'pdf' | 'word') => void;
  onFinalize: () => void;
  onRequestSignature: () => void;
  onDelete: () => void;
  onCopyLink: (url: string) => void;
}

function DocumentRow({
  doc,
  canWrite,
  canFinalize,
  busy,
  onPreview,
  onDownload,
  onFinalize,
  onRequestSignature,
  onDelete,
  onCopyLink,
}: DocumentRowProps) {
  const isFinalized = doc.status === GeneratedDocumentStatus.FINALIZED;
  const signatures = doc.signatures ?? [];

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">
              {DOC_TYPE_LABEL[doc.documentType] ?? doc.documentType}
            </span>
            <StatusBadge map={GENERATED_DOCUMENT_STATUS} status={doc.status} />
            {doc.isEdited && <span className="text-xs text-gray-400">(bewerkt)</span>}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Gegenereerd op {formatDateTime(doc.generatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onPreview}>
            Preview
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDownload('pdf')}
            isLoading={busy === `${doc.id}:pdf`}
          >
            PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDownload('word')}
            isLoading={busy === `${doc.id}:word`}
          >
            Word
          </Button>
          {canWrite && !isFinalized && (
            <Button size="sm" variant="ghost" onClick={onRequestSignature}>
              Handtekening aanvragen
            </Button>
          )}
          {canFinalize && !isFinalized && (
            <Button size="sm" variant="secondary" onClick={onFinalize}>
              Finaliseren
            </Button>
          )}
          {canWrite && !isFinalized && (
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-danger-600 hover:text-danger-700">
              Verwijderen
            </Button>
          )}
        </div>
      </div>

      {signatures.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-lg bg-gray-50 px-3 py-2">
          {signatures.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-900">{s.signerName ?? 'Onbekend'}</span>
              <LookupBadge kind="signer-roles" code={s.signerRoleCode} />
              <StatusBadge map={SIGNATURE_STATUS} status={s.status} />
              {s.status === SignatureStatus.REQUESTED && s.signatureRequestUrl && (
                <button
                  type="button"
                  onClick={() => onCopyLink(s.signatureRequestUrl!)}
                  className="text-xs font-medium text-primary-600 underline hover:text-primary-800"
                >
                  Kopieer link
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
