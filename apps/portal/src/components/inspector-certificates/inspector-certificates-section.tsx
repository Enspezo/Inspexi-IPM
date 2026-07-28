import { useState } from 'react';
import {
  Button,
  ErrorBox,
  Spinner,
  StatusBadge,
  Table,
  useConfirm,
  useToast,
  type Column,
} from '@/components/ui';
import { formatShortDate } from '@/lib/format';
import { CERTIFICATE_VALIDITY, getCertificateValidityKey } from '@/lib/status';
import { downloadCertificateDocument } from '@/lib/download-file';
import { getErrorMessage } from '@/lib/api-client';
import type { InspectorCertificate } from '@/types';
import {
  useInspectorCertificates,
  useDeleteInspectorCertificate,
} from '@/pages/inspectors/hooks/use-inspector-certificates';
import { CertificateFormModal } from './certificate-form-modal';
import { CertificatePreviewModal } from './certificate-preview-modal';

interface InspectorCertificatesSectionProps {
  userId: string;
  /** Mag de gebruiker certificaten toevoegen/bewerken/verwijderen? (SUPERUSER/ORG_ADMIN of self) */
  canEdit: boolean;
}

/**
 * Herbruikbare sectie met de diploma's/certificaten van één inspecteur. Wordt op
 * twee plekken gebruikt: Inspecties → Inspecteurs en Organisatie → Gebruikers →
 * tab "Certificering". Lezen kan management + self; bewerken alleen bij `canEdit`.
 */
export function InspectorCertificatesSection({
  userId,
  canEdit,
}: InspectorCertificatesSectionProps) {
  const { data, isLoading, error } = useInspectorCertificates({ userId });
  const deleteMutation = useDeleteInspectorCertificate();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<InspectorCertificate | null>(null);
  const [previewing, setPreviewing] = useState<InspectorCertificate | null>(null);

  const certificates = data?.data ?? [];

  const handleDownload = async (cert: InspectorCertificate) => {
    try {
      await downloadCertificateDocument(cert.id, cert.originalName ?? 'certificaat');
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const handleDelete = async (cert: InspectorCertificate) => {
    const ok = await confirm({
      title: 'Certificaat verwijderen',
      message: `Weet je zeker dat je "${cert.type}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(cert.id);
      showToast('Certificaat verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const columns: Column<InspectorCertificate>[] = [
    {
      key: 'type',
      header: 'Soort',
      render: (c) => <span className="font-medium text-gray-900">{c.type}</span>,
    },
    { key: 'number', header: 'Nummer', render: (c) => c.number || '—' },
    { key: 'issueDate', header: 'Datum', render: (c) => formatShortDate(c.issueDate) },
    {
      key: 'validUntil',
      header: 'Geldig tot',
      render: (c) => (
        <div className="flex items-center gap-2">
          <StatusBadge map={CERTIFICATE_VALIDITY} status={getCertificateValidityKey(c.validUntil)} />
          {c.validUntil && (
            <span className="text-xs text-gray-500">{formatShortDate(c.validUntil)}</span>
          )}
        </div>
      ),
    },
    { key: 'issuer', header: 'Instantie', render: (c) => c.issuer },
    {
      key: 'document',
      header: 'Document',
      render: (c) =>
        c.hasDocument ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewing(c)}
              className="inline-flex items-center gap-1 font-medium text-primary-600 hover:text-primary-800 hover:underline"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Bekijken
            </button>
            <button
              type="button"
              onClick={() => handleDownload(c)}
              title="Downloaden"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
  ];

  if (canEdit) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setEditing(c)}
            title="Bewerken"
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleDelete(c)}
            disabled={deleteMutation.isPending}
            title="Verwijderen"
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <ErrorBox>Kon de certificaten niet laden.</ErrorBox>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {certificates.length}{' '}
          {certificates.length === 1 ? 'certificaat' : 'certificaten'}
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setIsAddOpen(true)}>
            Certificaat toevoegen
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        data={certificates}
        keyExtractor={(c) => c.id}
        emptyMessage="Nog geen certificaten of diploma's vastgelegd."
      />

      <CertificateFormModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        userId={userId}
      />
      <CertificateFormModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        userId={userId}
        certificate={editing}
      />
      <CertificatePreviewModal
        isOpen={!!previewing}
        onClose={() => setPreviewing(null)}
        certificate={previewing}
      />
    </div>
  );
}
