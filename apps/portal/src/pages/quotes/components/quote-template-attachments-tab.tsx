import { Button } from '@/components/ui';
import { formatFileSize } from '@/lib/format';
import type { QuoteTemplateAttachment } from '@/types';
import { FileIcon } from './quote-template-file-icon';

// ── Bijlagen tab (shared) ──────────────────────────────

export function AttachmentsTab({
  attachments,
  userIsAdmin,
  handleAttachmentUpload,
  isUploading,
  handleAttachmentDownload,
  handleAttachmentDelete,
}: {
  attachments: QuoteTemplateAttachment[] | undefined;
  userIsAdmin: boolean;
  handleAttachmentUpload: () => void;
  isUploading: boolean;
  handleAttachmentDownload: (att: QuoteTemplateAttachment) => void;
  handleAttachmentDelete: (attId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Standaard bijlagen</h3>
          <p className="text-sm text-gray-500">
            Deze bestanden worden automatisch bijgevoegd bij offertes op basis van dit template.
          </p>
        </div>
        {userIsAdmin && (
          <Button
            variant="secondary"
            onClick={handleAttachmentUpload}
            isLoading={isUploading}
          >
            Bijlage toevoegen
          </Button>
        )}
      </div>

      {attachments && attachments.length > 0 ? (
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <FileIcon mimeType={att.mimeType} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{att.fileName}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(att.fileSize)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAttachmentDownload(att)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Downloaden"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                {userIsAdmin && (
                  <button
                    type="button"
                    onClick={() => handleAttachmentDelete(att.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Verwijderen"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          Geen standaard bijlagen. Voeg bestanden toe die automatisch meegezonden worden met offertes.
        </div>
      )}
    </div>
  );
}
