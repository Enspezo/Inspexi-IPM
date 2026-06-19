// ===========================================
// BlockAddMenu — Menu om een nieuw block toe te voegen
// ===========================================

import { useState, useRef, useEffect } from 'react';
import { PlusIcon, BLOCK_ICONS } from './icons';
import { getBlocksByCategory } from './block-registry';
import type { DocBlockCategory, DocBlockType } from './types';

interface BlockAddMenuProps {
  onAdd: (type: DocBlockType) => void;
}

const CATEGORIES: { key: DocBlockCategory; label: string }[] = [
  { key: 'core', label: 'Basis' },
  { key: 'layout', label: 'Layout' },
  { key: 'inspection', label: 'Inspectie' },
];

export function BlockAddMenu({ onAdd }: BlockAddMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
      >
        <PlusIcon className="h-4 w-4" />
        Block toevoegen
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {CATEGORIES.map(({ key, label }) => {
            const blocks = getBlocksByCategory(key);
            if (blocks.length === 0) return null;
            return (
              <div key={key} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {blocks.map((block) => {
                    const Icon = BLOCK_ICONS[block.icon];
                    return (
                      <button
                        key={block.type}
                        type="button"
                        onClick={() => {
                          onAdd(block.type);
                          setOpen(false);
                        }}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-gray-50"
                      >
                        {Icon && <Icon className="h-4 w-4 shrink-0 text-gray-500" />}
                        <div>
                          <p className="text-xs font-medium text-gray-700">{block.label}</p>
                          {block.description && (
                            <p className="text-[10px] leading-tight text-gray-400">{block.description}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
