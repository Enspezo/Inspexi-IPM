import { formatFileSize } from '@/lib/format';
import type { QuoteTemplateDocxRevision } from '@/types';

// ── DOCX: Revisies tab ─────────────────────────────────

export function RevisionsTab({
  docxRevisions,
  handleRevisionDownload,
}: {
  docxRevisions: QuoteTemplateDocxRevision[] | undefined;
  handleRevisionDownload: (revision: QuoteTemplateDocxRevision) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Revisiegeschiedenis</h3>
        <p className="text-sm text-gray-500">
          Eerdere versies van het DOCX bestand worden hier bewaard.
        </p>
      </div>

      {docxRevisions && docxRevisions.length > 0 ? (
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {docxRevisions.map((rev) => (
            <div key={rev.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-gray-600 text-xs font-bold">
                  v{rev.version}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{rev.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(rev.fileSize)}
                    {rev.uploadedBy && (
                      <span> · {rev.uploadedBy.firstName} {rev.uploadedBy.lastName}</span>
                    )}
                    {' · '}
                    {new Date(rev.createdAt).toLocaleDateString('nl-NL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevisionDownload(rev)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Downloaden"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          Nog geen eerdere versies. Revisies worden automatisch aangemaakt wanneer u een nieuw DOCX bestand uploadt.
        </div>
      )}
    </div>
  );
}
