import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { getAccessToken } from '@/lib/api-client';
import { renderAsync as renderDocx } from 'docx-preview';
import * as XLSX from 'xlsx';

const BASE_URL = '/api/v1';

/**
 * Generic, file-agnostic preview modal. Owns the modal shell, the authenticated
 * blob-fetch and the per-MIME renderers (image / PDF / CSV / DOCX / XLSX). The
 * right-hand metadata sidebar is caller-provided, so both the DMS
 * (DocumentPreviewModal) and inspector certificates can reuse the exact same
 * preview machinery with their own metadata.
 */

export function getMimeLabel(mimeType: string): string {
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

const WORD_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

export function isPreviewable(mimeType: string): boolean {
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
  return <iframe src={url} title="PDF Preview" className="h-full w-full border-0" />;
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
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const separator = lines[0]?.includes(';') ? ';' : ',';
        const parsed = lines.map((line) => line.split(separator));
        setRows(parsed.slice(0, 100));
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
                <td key={ci} className="whitespace-nowrap px-3 py-1.5 text-gray-700">
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
      <svg className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
      <p className="text-sm font-medium text-gray-500">Preview niet beschikbaar</p>
      <p className="text-xs text-gray-400">{getMimeLabel(mimeType)}</p>
    </div>
  );
}

// ---------- Generic modal ----------

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** API-pad (zonder /api/v1) dat het bestand streamt, bijv. `/documents/:id/download`. */
  downloadPath: string | null;
  /** Bestandsnaam in de header. */
  fileName: string;
  mimeType: string;
  /** Rechter metadata-paneel — door de aanroeper aangeleverd. */
  sidebar: ReactNode;
}

export function FilePreviewModal({
  isOpen,
  onClose,
  downloadPath,
  fileName,
  mimeType,
  sidebar,
}: FilePreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBlob = useCallback(async (path: string) => {
    setIsLoading(true);
    try {
      const token = getAccessToken();
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Download mislukt');
      const blob = await response.blob();
      setBlobUrl(URL.createObjectURL(blob));
    } catch {
      setBlobUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && downloadPath) {
      fetchBlob(downloadPath);
    }
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, downloadPath]);

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

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center bg-gray-50">
          <Spinner size="lg" />
        </div>
      );
    }
    if (!blobUrl || !isPreviewable(mimeType)) {
      return <NoPreview mimeType={mimeType} />;
    }
    if (mimeType.startsWith('image/')) return <ImagePreview url={blobUrl} />;
    if (mimeType === 'application/pdf') return <PdfPreview url={blobUrl} />;
    if (mimeType === 'text/csv') return <CsvPreview url={blobUrl} />;
    if (WORD_MIME_TYPES.includes(mimeType)) return <DocxPreview url={blobUrl} />;
    if (EXCEL_MIME_TYPES.includes(mimeType)) return <XlsxPreview url={blobUrl} />;
    return <NoPreview mimeType={mimeType} />;
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
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2
              id="preview-modal-title"
              className="truncate text-lg font-semibold text-gray-900"
              title={fileName}
            >
              {fileName}
            </h2>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Sluiten"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">{renderPreview()}</div>
        </div>

        {/* Metadata sidebar (caller-provided) */}
        <div className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50">
          <div className="p-5">{sidebar}</div>
        </div>
      </div>
    </div>
  );
}
