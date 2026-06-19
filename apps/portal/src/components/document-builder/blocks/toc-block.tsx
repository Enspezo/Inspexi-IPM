// ===========================================
// TocBlock — Inhoudsopgave (placeholder + instellingen)
// ===========================================

import { TocIcon } from '../icons';
import { INPUT_SM_CLASS } from '../ui';
import type { DocBlockProps, TocContent } from '../types';

const PREVIEW_ENTRIES = [
  { level: 1, title: '1. Inleiding', page: 3 },
  { level: 2, title: '1.1 Achtergrond', page: 3 },
  { level: 1, title: '2. Bevindingen', page: 5 },
  { level: 2, title: '2.1 Elektrische installatie', page: 5 },
  { level: 1, title: '3. Conclusie', page: 12 },
];

export function TocBlock({ content, onChange, isReadOnly }: DocBlockProps<TocContent>) {
  const title = content.title ?? 'Inhoudsopgave';
  const showPageNumbers = content.showPageNumbers ?? true;

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <TocIcon className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        </div>
        <div className="space-y-1">
          {PREVIEW_ENTRIES.map((entry, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs text-gray-500"
              style={{ paddingLeft: `${(entry.level - 1) * 16}px` }}
            >
              <span className="truncate">{entry.title}</span>
              {showPageNumbers && <span className="ml-2 shrink-0 text-gray-400">{entry.page}</span>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs italic text-gray-400">(Automatisch gegenereerd bij export)</p>
      </div>
      {!isReadOnly && (
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => onChange({ ...content, title: e.target.value })}
              className={`w-full ${INPUT_SM_CLASS}`}
            />
          </div>
          <label className="flex items-center gap-2 pb-1.5">
            <input
              type="checkbox"
              checked={showPageNumbers}
              onChange={(e) => onChange({ ...content, showPageNumbers: e.target.checked })}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500/20"
            />
            <span className="cursor-pointer text-xs text-gray-500">Paginanummers</span>
          </label>
        </div>
      )}
    </div>
  );
}
