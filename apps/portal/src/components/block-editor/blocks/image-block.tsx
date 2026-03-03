import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Spinner } from '@/components/ui';
import { useUploadTemplateImage } from '@/pages/quotes/hooks/use-quote-templates';
import { getAccessToken } from '@/lib/api-client';

interface ImageBlockProps {
  content: { storageKey?: string; fileName?: string; alt?: string };
  onChange: (content: { storageKey: string; fileName: string; alt?: string }) => void;
  templateId: string;
}

export function ImageBlock({ content, onChange, templateId }: ImageBlockProps) {
  const uploadMutation = useUploadTemplateImage(templateId);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Load image preview from storage
  useEffect(() => {
    if (!content.storageKey) return;

    let revoked = false;
    const token = getAccessToken();
    const url = `/api/v1/quote-templates/${templateId}/images/${content.storageKey}`;

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        if (revoked) return;
        const objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      revoked = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.storageKey, templateId]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const result = await uploadMutation.mutateAsync(formData);
        onChange({
          storageKey: result.storageKey,
          fileName: result.fileName,
          alt: content.alt,
        });
      } catch {
        // Error handled by mutation
      }
    },
    [uploadMutation, onChange, content.alt],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  if (content.storageKey) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center min-h-[120px]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={content.alt || content.fileName || ''}
              className="max-w-full max-h-[300px] object-contain"
            />
          ) : (
            <Spinner size="sm" />
          )}
          <button
            type="button"
            onClick={() => onChange({ storageKey: '', fileName: '', alt: '' })}
            className="absolute top-2 right-2 rounded-full bg-white/80 p-1 text-gray-600 hover:bg-white hover:text-red-600 transition-colors"
            title="Afbeelding verwijderen"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <Input
          placeholder="Alt-tekst (optioneel)"
          value={content.alt || ''}
          onChange={(e) =>
            onChange({ ...content, storageKey: content.storageKey!, fileName: content.fileName!, alt: e.target.value })
          }
        />
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
        isDragOver
          ? 'border-primary-400 bg-primary-50'
          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
      }`}
    >
      {uploadMutation.isPending ? (
        <Spinner size="sm" />
      ) : (
        <>
          <svg className="h-10 w-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm text-gray-500 mb-2">Sleep een afbeelding hierheen of</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/jpeg,image/png,image/svg+xml,image/webp';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileSelect(file);
              };
              input.click();
            }}
          >
            Kies bestand
          </Button>
        </>
      )}
    </div>
  );
}
