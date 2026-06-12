import { useRef } from 'react';
import type { QuoteAttachment } from '@/types';
import { Button, Card, useConfirm, useToast } from '@/components/ui';
import { formatFileSize } from '@/lib/format';
import { useUploadQuoteAttachment, useDeleteQuoteAttachment } from '../hooks/use-quotes';
import { getErrorMessage } from '@/lib/api-client';

export function QuoteAttachmentsCard({
  quoteId,
  attachments,
  userCanWrite,
}: {
  quoteId: string;
  attachments: QuoteAttachment[] | undefined;
  userCanWrite: boolean;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const uploadAttachmentMutation = useUploadQuoteAttachment(quoteId);
  const deleteAttachmentMutation = useDeleteQuoteAttachment(quoteId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAttachmentMutation.mutateAsync(file);
      showToast('Bijlage geüpload', 'success');
    } catch (err) { showToast(getErrorMessage(err, 'Uploaden mislukt'), 'error'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const confirmed = await confirm({
      title: 'Bijlage verwijderen',
      message: 'Bijlage verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteAttachmentMutation.mutateAsync(attachmentId);
      showToast('Bijlage verwijderd', 'success');
    } catch (err) { showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error'); }
  };

  const handleDownloadAttachment = async (attachment: QuoteAttachment) => {
    try {
      const response = await fetch(`/api/v1/quotes/${quoteId}/attachments/${attachment.id}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken') ?? ''}` },
        credentials: 'include',
      });
      // Use apiClient approach: fetch with auth
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { showToast(getErrorMessage(err, 'Downloaden mislukt'), 'error'); }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Bijlagen bij offerte</h3>
        {userCanWrite && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              isLoading={uploadAttachmentMutation.isPending}
            >
              <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              Bijlage uploaden
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv,.zip" />
          </>
        )}
      </div>
      {(attachments?.length || 0) === 0 ? (
        <p className="text-sm text-gray-500">Geen bijlagen</p>
      ) : (
        <div className="space-y-2">
          {attachments?.map((att: QuoteAttachment) => (
            <div key={att.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                <span className="truncate text-sm text-gray-900">{att.fileName}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(att.fileSize)}</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => handleDownloadAttachment(att)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Downloaden">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
                {userCanWrite && (
                  <button onClick={() => handleDeleteAttachment(att.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
