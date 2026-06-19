// ===========================================
// PlaceholderBlock — Dynamische variabele / placeholder
// ===========================================

import { PlaceholderIcon } from '../icons';
import { INPUT_SM_CLASS } from '../ui';
import type { DocBlockProps, PlaceholderContent } from '../types';

export function PlaceholderBlock({ content, onChange, isReadOnly }: DocBlockProps<PlaceholderContent>) {
  if (isReadOnly) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 font-mono text-sm text-blue-700">
        <PlaceholderIcon className="h-3.5 w-3.5" />
        {content.placeholder || 'variabele'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-mono text-sm text-blue-700">
        <PlaceholderIcon className="h-4 w-4 shrink-0" />
        <span className="opacity-60">{'{{'}</span>
        <span className="font-semibold">{content.placeholder || '...'}</span>
        <span className="opacity-60">{'}}'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Variabele-pad</label>
          <input
            type="text"
            value={content.placeholder}
            onChange={(e) => onChange({ ...content, placeholder: e.target.value })}
            placeholder="bijv. organization.name"
            className={`w-full font-mono ${INPUT_SM_CLASS}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Label (optioneel)</label>
          <input
            type="text"
            value={content.label ?? ''}
            onChange={(e) => onChange({ ...content, label: e.target.value })}
            placeholder="bijv. Organisatienaam"
            className={`w-full ${INPUT_SM_CLASS}`}
          />
        </div>
      </div>
    </div>
  );
}
