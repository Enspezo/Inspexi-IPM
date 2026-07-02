import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDocument } from './hooks/use-documents';
import { Spinner, Card, Button, StatusBadge, LookupBadge, ErrorBox, InfoField, useToast } from '@/components/ui';
import { GENERATED_DOCUMENT_STATUS, SIGNATURE_STATUS } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { documentTypeLabel } from '@/lib/labels';
import { downloadClientDocument } from '@/lib/download';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { getErrorMessage } from '@/lib/api-client';
import { SignatureModal } from '@/components/signature-modal';
import type { DocumentSignature } from '@/types';

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: doc, isLoading, error } = useDocument(id);
  const { showToast } = useToast();
  const [showSign, setShowSign] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <ErrorBox>Kon het document niet laden.</ErrorBox>
        <Link to="/dashboard" className="text-sm font-medium text-primary-600 hover:underline">
          ← Terug naar dashboard
        </Link>
      </div>
    );
  }

  const hasPendingClientSignature = doc.signatures.some(
    (s) => s.signerRoleCode === 'CLIENT' && (s.status === 'PENDING' || s.status === 'REQUESTED'),
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const ref = doc.inspectionPlan.referenceNumber || 'document';
      await downloadClientDocument(doc.id, `${documentTypeLabel(doc.documentType)}-${ref}.pdf`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to={`/inspections/${doc.inspectionPlan.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Terug naar inspectie
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{documentTypeLabel(doc.documentType)}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {doc.inspectionPlan.projectName}
            {doc.inspectionPlan.addressCity ? ` — ${doc.inspectionPlan.addressCity}` : ''}
          </p>
        </div>
        <StatusBadge map={GENERATED_DOCUMENT_STATUS} status={doc.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Documentvoorbeeld">
            {doc.htmlContent ? (
              <div
                className="max-w-none text-sm text-gray-800 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(doc.htmlContent) }}
              />
            ) : (
              <p className="py-10 text-center text-sm text-gray-500">
                Geen voorbeeld beschikbaar. Download de PDF om het document te bekijken.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Acties">
            <div className="space-y-2">
              {doc.pdfUrl && (
                <Button className="w-full" variant="secondary" onClick={handleDownload} isLoading={downloading}>
                  Download PDF
                </Button>
              )}
              {hasPendingClientSignature && (
                <Button className="w-full" onClick={() => setShowSign(true)}>
                  Ondertekenen
                </Button>
              )}
              {!doc.pdfUrl && !hasPendingClientSignature && (
                <p className="text-sm text-gray-500">Geen acties beschikbaar.</p>
              )}
            </div>
          </Card>

          <Card title="Handtekeningen">
            {doc.signatures.length === 0 ? (
              <p className="text-sm text-gray-500">Geen handtekeningen vereist.</p>
            ) : (
              <ul className="space-y-3">
                {doc.signatures.map((sig) => (
                  <SignatureRow key={sig.id} signature={sig} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Details">
            <dl className="space-y-3">
              <InfoField label="Type" value={documentTypeLabel(doc.documentType)} />
              <InfoField label="Aangemaakt" value={formatDate(doc.generatedAt)} />
              <InfoField label="Definitief op" value={doc.finalizedAt ? formatDate(doc.finalizedAt) : null} />
              <InfoField label="Referentie" value={doc.inspectionPlan.referenceNumber} />
            </dl>
          </Card>
        </div>
      </div>

      {showSign && (
        <SignatureModal
          documentId={doc.id}
          documentType={doc.documentType}
          projectName={doc.inspectionPlan.projectName}
          onClose={() => setShowSign(false)}
          onSuccess={() => setShowSign(false)}
        />
      )}
    </div>
  );
}

function SignatureRow({ signature }: { signature: DocumentSignature }) {
  const signed = signature.status === 'SIGNED';
  return (
    <li className="flex items-start gap-2">
      <svg
        className={`mt-0.5 h-4 w-4 shrink-0 ${signed ? 'text-success-600' : 'text-gray-300'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        {signed ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        ) : (
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <LookupBadge kind="signer-roles" code={signature.signerRoleCode} />
          <span className="text-sm text-gray-900">{signature.signerName ?? 'Niet toegewezen'}</span>
        </div>
        {signature.signerFunction && <p className="text-xs text-gray-500">{signature.signerFunction}</p>}
        <p className="mt-0.5 text-xs">
          {signed && signature.signedAt ? (
            <span className="text-gray-500">Getekend op {formatDate(signature.signedAt)}</span>
          ) : (
            <StatusBadge map={SIGNATURE_STATUS} status={signature.status} />
          )}
        </p>
      </div>
    </li>
  );
}
