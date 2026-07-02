import { useState, useEffect } from 'react';
import { Button, TagPill, TagSelect, useToast } from '@/components/ui';
import { downloadFile } from '@/lib/download-file';
import { formatFileSize, formatDateTimeLong } from '@/lib/format';
import { getErrorMessage } from '@/lib/api-client';
import type { CrmDocument } from '@/types';
import { useUpdateDocument } from '@/pages/documents/hooks/use-documents';
import { useDocumentTagsCompact } from '@/pages/organization/hooks/use-document-tags';
import { FilePreviewModal, getMimeLabel } from './file-preview-modal';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: CrmDocument | null;
  /** Sta toe om de tags van dit document te bewerken. */
  canEditTags?: boolean;
}

const entityTypeLabels: Record<string, string> = {
  CONTACT: 'Relatie',
  REQUEST: 'Aanvraag',
  QUOTE: 'Offerte',
  PRODUCT: 'Product',
  TASK: 'Taak',
};

/**
 * DMS-documentpreview. Levert de document-specifieke metadata + tag-bewerking aan
 * de generieke {@link FilePreviewModal}, die de preview-rendering verzorgt.
 */
export function DocumentPreviewModal({
  isOpen,
  onClose,
  document: doc,
  canEditTags = false,
}: DocumentPreviewModalProps) {
  const { showToast } = useToast();

  // ─── Tag-bewerking ───────────────────────────────────
  const { data: availableTags } = useDocumentTagsCompact();
  const updateMutation = useUpdateDocument();
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [draftTagIds, setDraftTagIds] = useState<string[]>([]);
  // Local copy of the document's tags so the read-view reflects a save
  // immediately (the `doc` prop is not refreshed while the modal stays open).
  const [currentTags, setCurrentTags] = useState<CrmDocument['tags']>([]);

  useEffect(() => {
    setIsEditingTags(false);
    setCurrentTags(doc?.tags ?? []);
    setDraftTagIds((doc?.tags ?? []).map((t) => t.id));
  }, [doc?.id, doc?.tags]);

  const handleSaveTags = async () => {
    if (!doc) return;
    try {
      const updated = await updateMutation.mutateAsync({
        id: doc.id,
        data: { tagIds: draftTagIds },
      });
      setCurrentTags(updated.tags ?? []);
      showToast('Tags bijgewerkt', 'success');
      setIsEditingTags(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  if (!isOpen || !doc) return null;

  const handleDownload = async () => {
    try {
      await downloadFile(doc.id, doc.originalName);
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const sidebar = (
    <>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
        Documentgegevens
      </h3>

      <div className="space-y-4">
        <MetaField label="Bestandsnaam" value={doc.originalName} />
        <MetaField label="Type" value={getMimeLabel(doc.mimeType)} />
        <MetaField label="Grootte" value={formatFileSize(doc.size)} />
        <MetaField
          label="Eigenaar"
          value={doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : '—'}
        />
        <MetaField label="Datum" value={formatDateTimeLong(doc.createdAt)} />

        {doc.description && <MetaField label="Beschrijving" value={doc.description} />}

        <div className="border-t border-gray-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Koppeling
          </h3>
          <MetaField
            label="Entiteit type"
            value={entityTypeLabels[doc.entityType] || doc.entityType}
          />
          {doc.entityName && <MetaField label="Entiteit" value={doc.entityName} />}
        </div>

        {/* Tags */}
        <div className="border-t border-gray-200 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Tags
            </h3>
            {canEditTags && !isEditingTags && (
              <button
                onClick={() => setIsEditingTags(true)}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                Bewerken
              </button>
            )}
          </div>

          {isEditingTags ? (
            <div className="space-y-3">
              <TagSelect
                available={availableTags ?? []}
                selectedIds={draftTagIds}
                onChange={setDraftTagIds}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveTags} isLoading={updateMutation.isPending}>
                  Opslaan
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDraftTagIds((currentTags ?? []).map((t) => t.id));
                    setIsEditingTags(false);
                  }}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          ) : currentTags && currentTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {currentTags.map((tag) => (
                <TagPill key={tag.id} tag={tag} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Geen tags</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <Button className="w-full" onClick={handleDownload}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Downloaden
        </Button>
      </div>
    </>
  );

  return (
    <FilePreviewModal
      isOpen={isOpen}
      onClose={onClose}
      downloadPath={`/documents/${doc.id}/download`}
      fileName={doc.originalName}
      mimeType={doc.mimeType}
      sidebar={sidebar}
    />
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900">{value}</dd>
    </div>
  );
}
