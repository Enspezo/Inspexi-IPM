import { useState } from 'react';
import { Button, Spinner, useToast } from '@/components/ui';
import { useEntityDocuments, useDeleteDocument } from '@/pages/documents/hooks/use-documents';
import { downloadFile } from '@/lib/download-file';
import { UploadDocumentModal } from './upload-document-modal';
import { DocumentPreviewModal } from './document-preview-modal';
import type { DocumentEntityType, CrmDocument } from '@/types';

interface DocumentsSectionProps {
  entityType: DocumentEntityType;
  entityId: string;
  canUpload?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
}: {
  doc: CrmDocument;
  canDelete: boolean;
  onPreview: (doc: CrmDocument) => void;
}) {
  const { showToast } = useToast();
  const deleteMutation = useDeleteDocument();

  const handleDownload = async () => {
    try {
      await downloadFile(doc.id, doc.originalName);
    } catch {
      showToast('Download mislukt', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Weet je zeker dat je dit document wilt verwijderen?')) return;
    try {
      await deleteMutation.mutateAsync(doc.id);
      showToast('Document verwijderd', 'success');
    } catch {
      showToast('Verwijderen mislukt', 'error');
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
          <span>{formatBytes(doc.size)}</span>
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
        </div>
        {doc.description && (
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {doc.description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
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
}: DocumentsSectionProps) {
  const { data, isLoading } = useEntityDocuments(entityType, entityId);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<CrmDocument | null>(null);

  const documents = data?.data || [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Documenten{documents.length > 0 ? ` (${documents.length})` : ''}
        </h3>
        {canUpload && (
          <Button size="sm" variant="secondary" onClick={() => setIsUploadOpen(true)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Uploaden
          </Button>
        )}
      </div>

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
      />
    </div>
  );
}
