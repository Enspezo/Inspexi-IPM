import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Spinner, TagPill, TagSelect, useToast } from '@/components/ui';
import { downloadFile } from '@/lib/download-file';
import { formatFileSize } from '@/lib/format';
import { getAccessToken, getErrorMessage } from '@/lib/api-client';
import type { CrmDocument } from '@/types';
import { useUpdateDocument } from '@/pages/documents/hooks/use-documents';
import { useDocumentTagsCompact } from '@/pages/organization/hooks/use-document-tags';
import { renderAsync as renderDocx } from 'docx-preview';
import * as XLSX from 'xlsx';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: CrmDocument | null;
  /** Sta toe om de tags van dit document te bewerken. */
  canEditTags?: boolean;
}

const BASE_URL = '/api/v1';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMimeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/jpeg') return 'JPEG afbeelding';
  if (mimeType === 'image/png') return 'PNG afbeelding';
  if (mimeType === 'image/svg+xml') return 'SVG afbeelding';
  if (mimeType === 'image/webp') return 'WebP afbeelding';
  if (mimeType === 'application/msword') return 'Word document (.doc)';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return 'Word document (.docx)';
  if (mimeType === 'application/vnd.ms-excel') return 'Excel spreadsheet (.xls)';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    return 'Excel spreadsheet (.xlsx)';
  if (mimeType === 'application/vnd.ms-powerpoint') return 'PowerPoint presentatie (.ppt)';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    return 'PowerPoint presentatie (.pptx)';
  if (mimeType === 'text/csv') return 'CSV bestand';
  if (mimeType === 'application/zip') return 'ZIP archief';
  return mimeType;
}

const entityTypeLabels: Record<string, string> = {
  CONTACT: 'Relatie',
  REQUEST: 'Aanvraag',
  QUOTE: 'Offerte',
  PRODUCT: 'Product',
  TASK: 'Taak',
};

const WORD_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

function isPreviewable(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType === 'text/csv' ||
    WORD_MIME_TYPES.includes(mimeType) ||
    EXCEL_MIME_TYPES.includes(mimeType)
  );
}

// ---------- Preview renderers ----------

function ImagePreview({ url }: { url: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 p-4">
      <img
        src={url}
        alt="Preview"
        className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
      />
    </div>
  );
}

function PdfPreview({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      title="PDF Preview"
      className="h-full w-full border-0"
    />
  );
}

function CsvPreview({ url }: { url: string }) {
  const [rows, setRows] = useState<string[][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        // Simple CSV parsing: split on newlines, then semicolons and commas
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const separator = lines[0]?.includes(';') ? ';' : ',';
        const parsed = lines.map((line) => line.split(separator));
        setRows(parsed.slice(0, 100)); // Limit to 100 rows for preview
        setIsLoading(false);
      })
      .catch(() => {
        setError('CSV kon niet geladen worden');
        setIsLoading(false);
      });
  }, [url]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">Leeg bestand</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-white p-4">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {rows[0].map((cell, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase text-gray-500"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.slice(1).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="whitespace-nowrap px-3 py-1.5 text-gray-700"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocxPreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    setError(null);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Download mislukt');
        return r.arrayBuffer();
      })
      .then((arrayBuffer) => {
        if (!containerRef.current) return;
        // Clear previous content
        containerRef.current.innerHTML = '';
        return renderDocx(arrayBuffer, containerRef.current, undefined, {
          className: 'docx-preview-content',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      })
      .then(() => setIsLoading(false))
      .catch(() => {
        setError('Word document kon niet geladen worden');
        setIsLoading(false);
      });
  }, [url]);

  return (
    <div className="h-full overflow-auto bg-gray-100">
      {isLoading && (
        <div className="flex h-full items-center justify-center">
          <Spinner size="md" />
        </div>
      )}
      {error && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="docx-preview-wrapper mx-auto"
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
      <style>{`
        .docx-preview-wrapper .docx-wrapper {
          background: #e5e7eb;
          padding: 16px;
        }
        .docx-preview-wrapper .docx-wrapper > section.docx {
          background: white;
          margin: 0 auto 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06);
          padding: 40px 50px;
          min-height: 600px;
        }
      `}</style>
    </div>
  );
}

function XlsxPreview({ url }: { url: string }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Download mislukt');
        return r.arrayBuffer();
      })
      .then((arrayBuffer) => {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const parsed = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
          return { name, html };
        });
        setSheets(parsed);
        setActiveSheet(0);
        setIsLoading(false);
      })
      .catch(() => {
        setError('Excel bestand kon niet geladen worden');
        setIsLoading(false);
      });
  }, [url]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Leeg bestand</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex shrink-0 gap-0.5 border-b border-gray-200 bg-gray-50 px-2 pt-1">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(idx)}
              className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                idx === activeSheet
                  ? 'border border-b-0 border-gray-200 bg-white text-gray-900'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Sheet content */}
      <div className="flex-1 overflow-auto p-2">
        <div
          className="xlsx-preview-content"
          dangerouslySetInnerHTML={{ __html: sheets[activeSheet]?.html || '' }}
        />
        <style>{`
          .xlsx-preview-content table {
            border-collapse: collapse;
            font-size: 13px;
            min-width: 100%;
          }
          .xlsx-preview-content th,
          .xlsx-preview-content td {
            border: 1px solid #e5e7eb;
            padding: 4px 8px;
            text-align: left;
            white-space: nowrap;
          }
          .xlsx-preview-content th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
          }
          .xlsx-preview-content td {
            color: #4b5563;
          }
          .xlsx-preview-content tr:hover td {
            background: #f0f9ff;
          }
        `}</style>
      </div>
    </div>
  );
}

function NoPreview({ mimeType }: { mimeType: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-gray-50 p-8">
      <svg
        className="h-16 w-16 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
      <p className="text-sm font-medium text-gray-500">
        Preview niet beschikbaar
      </p>
      <p className="text-xs text-gray-400">{getMimeLabel(mimeType)}</p>
    </div>
  );
}

// ---------- Main component ----------

export function DocumentPreviewModal({
  isOpen,
  onClose,
  document: doc,
  canEditTags = false,
}: DocumentPreviewModalProps) {
  const { showToast } = useToast();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  // Fetch the file as authenticated blob
  const fetchBlob = useCallback(async (documentId: string) => {
    setIsLoading(true);
    try {
      const token = getAccessToken();
      const response = await fetch(
        `${BASE_URL}/documents/${documentId}/download`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error('Download mislukt');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch {
      setBlobUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && doc) {
      fetchBlob(doc.id);
    }
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, doc?.id]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !doc) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleDownload = async () => {
    try {
      await downloadFile(doc.id, doc.originalName);
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  const canPreview = isPreviewable(doc.mimeType);

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center bg-gray-50">
          <Spinner size="lg" />
        </div>
      );
    }

    if (!blobUrl || !canPreview) {
      return <NoPreview mimeType={doc.mimeType} />;
    }

    if (doc.mimeType.startsWith('image/')) {
      return <ImagePreview url={blobUrl} />;
    }

    if (doc.mimeType === 'application/pdf') {
      return <PdfPreview url={blobUrl} />;
    }

    if (doc.mimeType === 'text/csv') {
      return <CsvPreview url={blobUrl} />;
    }

    if (WORD_MIME_TYPES.includes(doc.mimeType)) {
      return <DocxPreview url={blobUrl} />;
    }

    if (EXCEL_MIME_TYPES.includes(doc.mimeType)) {
      return <XlsxPreview url={blobUrl} />;
    }

    return <NoPreview mimeType={doc.mimeType} />;
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={{ animation: 'fade-in 0.15s ease-out' }}
    >
      <div
        className="flex h-[85vh] w-full max-w-6xl overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{ animation: 'fade-in 0.2s ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
      >
        {/* Preview area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2
              id="preview-modal-title"
              className="truncate text-lg font-semibold text-gray-900"
              title={doc.originalName}
            >
              {doc.originalName}
            </h2>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Sluiten"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Preview content */}
          <div className="flex-1 overflow-hidden">{renderPreview()}</div>
        </div>

        {/* Metadata sidebar */}
        <div className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50">
          <div className="p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Documentgegevens
            </h3>

            <div className="space-y-4">
              <MetaField label="Bestandsnaam" value={doc.originalName} />
              <MetaField label="Type" value={getMimeLabel(doc.mimeType)} />
              <MetaField label="Grootte" value={formatFileSize(doc.size)} />
              <MetaField
                label="Eigenaar"
                value={
                  doc.uploadedBy
                    ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
                    : '—'
                }
              />
              <MetaField label="Datum" value={formatDate(doc.createdAt)} />

              {doc.description && (
                <MetaField label="Beschrijving" value={doc.description} />
              )}

              <div className="border-t border-gray-200 pt-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Koppeling
                </h3>
                <MetaField
                  label="Entiteit type"
                  value={entityTypeLabels[doc.entityType] || doc.entityType}
                />
                {doc.entityName && (
                  <MetaField label="Entiteit" value={doc.entityName} />
                )}
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
                      <Button
                        size="sm"
                        onClick={handleSaveTags}
                        isLoading={updateMutation.isPending}
                      >
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
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
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
          </div>
        </div>
      </div>
    </div>
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
