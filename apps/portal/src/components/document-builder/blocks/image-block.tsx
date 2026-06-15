// ===========================================
// ImageBlock — Afbeelding (data-URL) toevoegen/voorvertonen
// ===========================================
//
// Document-templates hebben (anders dan quote-templates) geen image-upload-
// endpoint; de afbeelding wordt als data-URL in `content.url` opgeslagen. De
// Fase 4 BLOCKS-renderer leest `url` rechtstreeks, dus de preview werkt direct.

import { useRef } from 'react';
import { ImageIcon } from '../icons';
import { INPUT_SM_CLASS } from '../ui';
import type { DocBlockProps, ImageContent } from '../types';

export function ImageBlock({ content, onChange, isReadOnly }: DocBlockProps<ImageContent>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      onChange({ ...content, url: (event.target?.result as string) ?? undefined, fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    onChange({ ...content, url: undefined, storageKey: undefined, fileName: undefined });
  };

  const src = content.url;
  const hasStoredOnly = !content.url && !!content.storageKey;

  if (src || hasStoredOnly) {
    return (
      <div className="space-y-2">
        <div className="group/img relative flex min-h-[120px] items-center justify-center rounded-md border border-gray-200 bg-gray-50">
          {src ? (
            <img src={src} alt={content.alt || ''} className="max-h-96 max-w-full rounded object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-1 py-8 text-gray-400">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">Opgeslagen afbeelding</span>
            </div>
          )}
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleRemove}
              title="Afbeelding verwijderen"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-gray-600 opacity-0 transition-opacity hover:bg-white hover:text-red-600 group-hover/img:opacity-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {!isReadOnly && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Alt-tekst</label>
              <input
                value={content.alt || ''}
                onChange={(e) => onChange({ ...content, alt: e.target.value })}
                placeholder="Beschrijving"
                className={`w-full ${INPUT_SM_CLASS}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Bijschrift</label>
              <input
                value={content.title || ''}
                onChange={(e) => onChange({ ...content, title: e.target.value })}
                placeholder="Titel onder afbeelding"
                className={`w-full ${INPUT_SM_CLASS}`}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isReadOnly) {
    return (
      <div className="flex items-center justify-center rounded-md border-2 border-dashed border-gray-200 py-8 text-gray-400">
        <ImageIcon className="h-8 w-8" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-gray-300 px-4 py-8 text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-600"
      >
        <ImageIcon className="h-8 w-8" />
        <div className="text-sm">
          <span className="font-medium text-primary-600">Klik om te uploaden</span> of sleep hierheen
        </div>
        <p className="text-xs text-gray-400">PNG, JPG, SVG tot 10MB</p>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
    </>
  );
}
