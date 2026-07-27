import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useInspectionDocuments } from '../hooks/use-inspections';
import { Spinner, Button, StatusBadge, LookupBadge, ErrorBox, useToast } from '@/components/ui';
import { GENERATED_DOCUMENT_STATUS, SIGNATURE_STATUS } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { documentTypeLabel } from '@/lib/labels';
import { downloadClientDocument } from '@/lib/download';
import { getErrorMessage } from '@/lib/api-client';
import { SignatureModal } from '@/components/signature-modal';
import type { InspectionDocumentListItem } from '@/types';

function hasPendingClientSignature(doc: InspectionDocumentListItem): boolean {
  return doc.signatures.some(
    (s) => s.signerRoleCode === 'CLIENT' && (s.status === 'PENDING' || s.status === 'REQUESTED'),
  );
}

export function DocumentsTab({
  inspectionId,
  inspectionName,
}: {
  inspectionId: string;
  inspectionName: string;
}) {
  const { data, isLoading, error } = useInspectionDocuments(inspectionId);
  const [signingDoc, setSigningDoc] = useState<InspectionDocumentListItem | null>(null);
  const documents = data ?? [];

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorBox>Kon de documenten niet laden.</ErrorBox>}

      {data &&
        (documents.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Nog geen documenten gegenereerd.
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} onSign={() => setSigningDoc(doc)} />
            ))}
          </div>
        ))}

      {signingDoc && (
        <SignatureModal
          documentId={signingDoc.id}
          documentType={signingDoc.documentType}
          projectName={inspectionName}
          onClose={() => setSigningDoc(null)}
          onSuccess={() => setSigningDoc(null)}
        />
      )}
    </div>
  );
}

function DocumentCard({ doc, onSign }: { doc: InspectionDocumentListItem; onSign: () => void }) {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const pending = hasPendingClientSignature(doc);
  // B-406a (WP-B9): ondertekenen vereist een per-plan canSign-grant; zonder dat
  // recht geen knop of "vereist"-melding (voorheen: tekenen → pas dán een 403).
  const canSign = doc.canSign !== false;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadClientDocument(doc.id, `${documentTypeLabel(doc.documentType)}-${doc.id.slice(0, 8)}.pdf`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={clsx(
        'rounded-xl border bg-white p-4 shadow-sm',
        pending && canSign ? 'border-warning-500/40 ring-1 ring-warning-500/20' : 'border-gray-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{documentTypeLabel(doc.documentType)}</p>
          <p className="text-xs text-gray-500">{formatDate(doc.generatedAt)}</p>
        </div>
        <StatusBadge map={GENERATED_DOCUMENT_STATUS} status={doc.status} />
      </div>

      {pending && canSign && (
        <p className="mt-2 text-xs font-medium text-warning-600">Uw handtekening is vereist</p>
      )}
      {pending && !canSign && (
        <p className="mt-2 text-xs text-gray-500">
          Ondertekening verloopt via de link in uw e-mail.
        </p>
      )}

      {doc.signatures.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {doc.signatures.map((sig) => (
            <li key={sig.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <LookupBadge kind="signer-roles" code={sig.signerRoleCode} />
              <span>{sig.signerName ?? '—'}</span>
              {sig.status === 'SIGNED' && sig.signedAt ? (
                <span className="text-gray-400">· {formatDate(sig.signedAt)}</span>
              ) : (
                <StatusBadge map={SIGNATURE_STATUS} status={sig.status} />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/documents/${doc.id}`}
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Bekijken
        </Link>
        {doc.pdfUrl && (
          <Button size="sm" variant="secondary" onClick={handleDownload} isLoading={downloading}>
            Download PDF
          </Button>
        )}
        {pending && canSign && (
          <Button size="sm" onClick={onSign}>
            Ondertekenen
          </Button>
        )}
      </div>
    </div>
  );
}
