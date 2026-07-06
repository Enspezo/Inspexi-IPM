import { useState } from 'react';
import { Button, Select, Spinner, TagPill, useConfirm, useToast } from '@/components/ui';
import { useDocuments, useDeleteDocument, useUpdateDocument } from '@/pages/documents/hooks/use-documents';
import { useDocumentTagsCompact } from '@/pages/organization/hooks/use-document-tags';
import { downloadFile } from '@/lib/download-file';
import { formatFileSize } from '@/lib/format';
import { UploadDocumentModal } from './upload-document-modal';
import { DocumentPreviewModal } from './document-preview-modal';
import type { DocumentEntityType, CrmDocument } from '@/types';
import { getErrorMessage } from '@/lib/api-client';

interface DocumentsSectionProps {
  entityType: DocumentEntityType;
  entityId: string;
  canUpload?: boolean;
  /** Toon toggle om document met opdrachtgever te delen (alleen voor PLANNING documenten) */
  showSharedWithClient?: boolean;
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/pdf') {
    return (
      <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  if (mimeType.startsWith('image/')) {
    return (
      <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return (
      <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  }
  // Default document icon
  return (
    <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function DocumentRow({
  doc,
  canDelete,
  onPreview,
  showSharedWithClient,
}: {
  doc: CrmDocument;
  canDelete: boolean;
  onPreview: (doc: CrmDocument) => void;
  showSharedWithClient?: boolean;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const deleteMutation = useDeleteDocument();
  const updateMutation = useUpdateDocument();

  const handleDownload = async () => {
    try {
      await downloadFile(doc.id, doc.originalName);
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Document verwijderen',
      message: 'Weet je zeker dat je dit document wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(doc.id);
      showToast('Document verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleToggleShared = async () => {
    try {
      await updateMutation.mutateAsync({ id: doc.id, data: { isSharedWithClient: !doc.isSharedWithClient } });
      showToast(doc.isSharedWithClient ? 'Niet meer gedeeld met opdrachtgever' : 'Gedeeld met opdrachtgever', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="shrink-0">
        <FileTypeIcon mimeType={doc.mimeType} />
      </div>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => onPreview(doc)}
          className="block truncate text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline"
          title={doc.originalName}
        >
          {doc.originalName}
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{formatFileSize(doc.size)}</span>
          <span>&middot;</span>
          <span>
            {doc.uploadedBy
              ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
              : '—'}
          </span>
          <span>&middot;</span>
          <span>
            {new Date(doc.createdAt).toLocaleDateString('nl-NL', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
          {showSharedWithClient && doc.isSharedWithClient && (
            <>
              <span>&middot;</span>
              <span className="text-blue-600 font-medium">Zichtbaar voor opdrachtgever</span>
            </>
          )}
        </div>
        {doc.description && (
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {doc.description}
          </p>
        )}
        {doc.tags && doc.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {doc.tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {showSharedWithClient && canDelete && (
          <button
            onClick={handleToggleShared}
            disabled={updateMutation.isPending}
            title={doc.isSharedWithClient ? 'Verberg voor opdrachtgever' : 'Deel met opdrachtgever'}
            className={`rounded p-1.5 transition-colors ${
              doc.isSharedWithClient
                ? 'text-blue-600 hover:bg-blue-50'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        )}
        <button
          onClick={() => onPreview(doc)}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Preview"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button
          onClick={handleDownload}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Downloaden"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Verwijderen"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export function DocumentsSection({
  entityType,
  entityId,
  canUpload = false,
  showSharedWithClient = false,
}: DocumentsSectionProps) {
  const [tagFilter, setTagFilter] = useState('');
  const { data, isLoading } = useDocuments({
    entityType,
    entityId,
    tagId: tagFilter || undefined,
    limit: 100,
  });
  const { data: availableTags } = useDocumentTagsCompact();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<CrmDocument | null>(null);

  const documents = data?.data || [];

  const tagFilterOptions = [
    { value: '', label: 'Alle tags' },
    ...(availableTags ?? []).map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <div>
      {(canUpload || (availableTags && availableTags.length > 0)) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {availableTags && availableTags.length > 0 ? (
            <div className="w-44">
              <Select
                options={tagFilterOptions}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              />
            </div>
          ) : (
            <span />
          )}
          {canUpload && (
            <Button size="sm" variant="secondary" onClick={() => setIsUploadOpen(true)}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Uploaden
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : documents.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Nog geen documenten toegevoegd
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              canDelete={canUpload}
              onPreview={setPreviewDoc}
              showSharedWithClient={showSharedWithClient}
            />
          ))}
        </div>
      )}

      <UploadDocumentModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        entityType={entityType}
        entityId={entityId}
      />

      <DocumentPreviewModal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
        canEditTags={canUpload}
      />
    </div>
  );
}
