import { useRef, useState, useEffect, type DragEvent } from 'react';
import { clsx } from 'clsx';

interface PhotoUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/jpg'];

/** Gecontroleerde foto-uploader (JPG/PNG) voor constatering-resolutie. Parent houdt `files` vast. */
export function PhotoUploader({ files, onChange, maxFiles = 5, maxSizeMb = 5 }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndAdd = (incoming: FileList | File[]) => {
    setError(null);
    const valid: File[] = [];
    for (const file of Array.from(incoming)) {
      if (!ACCEPTED.includes(file.type)) {
        setError('Alleen JPG en PNG bestanden zijn toegestaan');
        continue;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        setError(`Maximale bestandsgrootte is ${maxSizeMb}MB`);
        continue;
      }
      valid.push(file);
    }
    const room = maxFiles - files.length;
    if (valid.length > room) {
      setError(`Maximaal ${maxFiles} foto's toegestaan`);
      valid.length = Math.max(0, room);
    }
    if (valid.length) onChange([...files, ...valid]);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) validateAndAdd(e.dataTransfer.files);
  };

  return (
    <div>
      {files.length < maxFiles && (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
            dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400',
          )}
        >
          <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mt-2 text-sm text-gray-600">Sleep foto's hierheen of klik om te selecteren</p>
          <p className="mt-1 text-xs text-gray-400">
            JPG of PNG, max {maxSizeMb}MB per foto ({files.length}/{maxFiles})
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) validateAndAdd(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {files.map((file, idx) => (
            <PhotoPreview
              key={`${file.name}-${file.size}-${idx}`}
              file={file}
              onRemove={() => onChange(files.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200">
      {url && <img src={url} alt={file.name} className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Foto verwijderen"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
