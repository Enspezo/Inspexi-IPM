import { useState, useEffect, useRef } from 'react';
import { renderAsync as renderDocx } from 'docx-preview';
import { Spinner } from '@/components/ui';
import { getAccessToken } from '@/lib/api-client';

// ── DOCX Preview Frame ──────────────────────────────────

export function DocxPreviewFrame({ templateId }: { templateId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    setError(null);

    const token = getAccessToken();
    fetch(`/api/v1/quote-templates/${templateId}/docx/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
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
        setError('DOCX preview kon niet geladen worden');
        setIsLoading(false);
      });
  }, [templateId]);

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-gray-100" style={{ minHeight: '500px' }}>
      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="md" />
        </div>
      )}
      {error && (
        <div className="flex h-64 items-center justify-center">
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
