import { useState, useRef, useEffect } from 'react';
import type { BlockType } from '@/types';

interface BlockAddMenuProps {
  onAdd: (type: BlockType) => void;
  hasQuoteLines: boolean;
}

const BLOCK_OPTIONS: { type: BlockType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    type: 'rich_text',
    label: 'Tekst',
    description: 'Opgemaakte tekst met placeholders',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    type: 'image',
    label: 'Afbeelding',
    description: 'Upload een afbeelding',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    type: 'quote_lines',
    label: 'Offerteregels',
    description: 'Tabel met offerteregels',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ),
  },
];

export function BlockAddMenu({ onAdd, hasQuoteLines }: BlockAddMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative flex items-center justify-center" ref={menuRef}>
      {/* Divider line with add button */}
      <div className="flex w-full items-center gap-2 py-2 group">
        <div className="flex-1 border-t border-dashed border-gray-300 group-hover:border-primary-300 transition-colors" />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
          title="Blok toevoegen"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="flex-1 border-t border-dashed border-gray-300 group-hover:border-primary-300 transition-colors" />
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-1">
            {BLOCK_OPTIONS.map((option) => {
              const disabled = option.type === 'quote_lines' && hasQuoteLines;
              return (
                <button
                  key={option.type}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onAdd(option.type);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    disabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="flex-shrink-0 text-gray-500">{option.icon}</span>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-gray-500">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
