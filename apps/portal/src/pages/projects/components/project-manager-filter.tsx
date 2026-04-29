import { useState, useRef, useEffect } from 'react';

export interface ProjectManagerOption {
  id: string;
  name: string;
  color: string;
  initials: string;
}

interface ProjectManagerFilterProps {
  managers: ProjectManagerOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ProjectManagerFilter({ managers, selectedIds, onChange }: ProjectManagerFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selectedIds.length === 0;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="text-xs text-gray-500 font-medium">Projectmanager:</span>
        {allSelected ? (
          <span className="text-gray-700">Allemaal</span>
        ) : (
          <div className="flex items-center gap-1">
            {selectedIds.slice(0, 4).map((id) => {
              const mgr = managers.find((m) => m.id === id);
              return mgr ? (
                <span
                  key={id}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: mgr.color }}
                  title={mgr.name}
                >
                  {mgr.initials}
                </span>
              ) : null;
            })}
            {selectedIds.length > 4 && (
              <span className="text-xs text-gray-600">+{selectedIds.length - 4}</span>
            )}
          </div>
        )}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="p-1">
            {/* All option */}
            <button
              onClick={() => onChange([])}
              className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
                allSelected ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  allSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                }`}
              >
                {allSelected && (
                  <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                  </svg>
                )}
              </span>
              <span>Alle projectmanagers</span>
            </button>

            {managers.length > 0 && <div className="my-1 border-t border-gray-100" />}

            {/* Individual managers */}
            {managers.map((mgr) => {
              const selected = selectedIds.includes(mgr.id);
              return (
                <button
                  key={mgr.id}
                  onClick={() => toggle(mgr.id)}
                  className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {/* Colored checkbox */}
                  <span
                    className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors"
                    style={{
                      borderColor: mgr.color,
                      backgroundColor: selected ? mgr.color : 'transparent',
                    }}
                  >
                    {selected && (
                      <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                      </svg>
                    )}
                  </span>
                  {/* Avatar */}
                  <span
                    className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: mgr.color }}
                  >
                    {mgr.initials}
                  </span>
                  <span className="truncate">{mgr.name}</span>
                </button>
              );
            })}

            {managers.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">Geen projectmanagers gevonden</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
