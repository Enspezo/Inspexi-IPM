import { useState, useRef, useEffect, useCallback } from 'react';
import { SignatureType } from '@/types';

type SignatureMode = 'draw' | 'upload' | 'text';

interface SignatureEditorProps {
  onSave: (type: SignatureType, data: string) => void;
  initialType?: SignatureType | null;
  initialData?: string | null;
  isSaving?: boolean;
  userName?: string;
}

const SCRIPT_FONTS = [
  { name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { name: 'Great Vibes', family: "'Great Vibes', cursive" },
  { name: 'Alex Brush', family: "'Alex Brush', cursive" },
  { name: 'Pacifico', family: "'Pacifico', cursive" },
];

function modeFromType(type: SignatureType | null | undefined): SignatureMode {
  if (type === SignatureType.UPLOAD) return 'upload';
  if (type === SignatureType.TEXT) return 'text';
  return 'draw';
}

// ─── Draw Tab ────────────────────────────────────────────

function DrawTab({
  onDataChange,
  initialData,
}: {
  onDataChange: (data: string | null) => void;
  initialData?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!initialData);

  useEffect(() => {
    if (initialData && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')!;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        ctx.drawImage(img, 0, 0);
        setIsEmpty(false);
      };
      img.src = initialData;
    }
  }, [initialData]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2937';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setIsDrawing(false);
      onDataChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onDataChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={560}
        height={180}
        className="w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-gray-300 bg-white"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Teken uw handtekening hierboven</span>
        {!isEmpty && (
          <button
            onClick={clear}
            type="button"
            className="text-xs text-red-500 hover:text-red-700 underline"
          >
            Wissen
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Upload Tab ──────────────────────────────────────────

function UploadTab({
  onDataChange,
  initialData,
}: {
  onDataChange: (data: string | null) => void;
  initialData?: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(initialData ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return; // max 2MB

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      onDataChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const clear = () => {
    setPreview(null);
    onDataChange(null);
  };

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="space-y-2">
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-4">
            <img
              src={preview}
              alt="Handtekening"
              className="max-h-24 max-w-full object-contain"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => fileInputRef.current?.click()}
              type="button"
              className="text-xs text-primary-600 hover:text-primary-800 underline"
            >
              Andere afbeelding kiezen
            </button>
            <button
              onClick={clear}
              type="button"
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Verwijderen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 py-8 text-center transition-colors hover:border-primary-400 hover:bg-primary-50"
        >
          <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm text-gray-600">
            Klik om een afbeelding te uploaden
          </span>
          <span className="text-xs text-gray-400">PNG, JPEG of SVG (max 2 MB)</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ─── Text Tab ────────────────────────────────────────────

function TextTab({
  onDataChange,
  initialData,
  userName,
}: {
  onDataChange: (data: string | null) => void;
  initialData?: string | null;
  userName: string;
}) {
  const [text, setText] = useState(initialData ?? userName);
  const [fontIndex, setFontIndex] = useState(0);

  useEffect(() => {
    if (text.trim()) {
      onDataChange(JSON.stringify({ text, font: SCRIPT_FONTS[fontIndex].family }));
    } else {
      onDataChange(null);
    }
  }, [text, fontIndex, onDataChange]);

  // Parse initialData if it's JSON
  useEffect(() => {
    if (initialData) {
      try {
        const parsed = JSON.parse(initialData);
        if (parsed.text) setText(parsed.text);
        if (parsed.font) {
          const idx = SCRIPT_FONTS.findIndex((f) => f.family === parsed.font);
          if (idx >= 0) setFontIndex(idx);
        }
      } catch {
        // Not JSON, use as plain text
        setText(initialData);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Naam voor handtekening
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Uw naam"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {/* Font selector */}
      <div className="grid grid-cols-2 gap-2">
        {SCRIPT_FONTS.map((font, i) => (
          <button
            key={font.name}
            type="button"
            onClick={() => setFontIndex(i)}
            className={`rounded-lg border-2 px-3 py-3 text-center transition-colors ${
              fontIndex === i
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span
              className="block text-xl text-gray-800"
              style={{ fontFamily: font.family }}
            >
              {text || userName}
            </span>
            <span className="mt-1 block text-xs text-gray-400">{font.name}</span>
          </button>
        ))}
      </div>

      {/* Live preview */}
      {text.trim() && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <span
            className="text-3xl text-gray-800"
            style={{ fontFamily: SCRIPT_FONTS[fontIndex].family }}
          >
            {text}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Editor ─────────────────────────────────────────

export function SignatureEditor({
  onSave,
  initialType,
  initialData,
  isSaving,
  userName = '',
}: SignatureEditorProps) {
  const [mode, setMode] = useState<SignatureMode>(() => modeFromType(initialType));
  const [data, setData] = useState<string | null>(initialData ?? null);

  const handleDataChange = useCallback((newData: string | null) => {
    setData(newData);
  }, []);

  const handleSave = () => {
    if (!data) return;
    const typeMap: Record<SignatureMode, SignatureType> = {
      draw: SignatureType.DRAW,
      upload: SignatureType.UPLOAD,
      text: SignatureType.TEXT,
    };
    onSave(typeMap[mode], data);
  };

  const handleModeChange = (newMode: SignatureMode) => {
    setMode(newMode);
    setData(newMode === modeFromType(initialType) ? (initialData ?? null) : null);
  };

  const tabs: { id: SignatureMode; label: string; icon: JSX.Element }[] = [
    {
      id: 'draw',
      label: 'Tekenen',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
    {
      id: 'upload',
      label: 'Uploaden',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'text',
      label: 'Tekst',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleModeChange(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === tab.id
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {mode === 'draw' && (
        <DrawTab
          onDataChange={handleDataChange}
          initialData={initialType === SignatureType.DRAW ? initialData : undefined}
        />
      )}
      {mode === 'upload' && (
        <UploadTab
          onDataChange={handleDataChange}
          initialData={initialType === SignatureType.UPLOAD ? initialData : undefined}
        />
      )}
      {mode === 'text' && (
        <TextTab
          onDataChange={handleDataChange}
          initialData={initialType === SignatureType.TEXT ? initialData : undefined}
          userName={userName}
        />
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!data || isSaving}
        className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Opslaan...' : 'Handtekening opslaan'}
      </button>
    </div>
  );
}
