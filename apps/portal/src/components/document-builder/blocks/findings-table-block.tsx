// ===========================================
// FindingsTableBlock — Bevindingentabel-configuratie
// ===========================================

import { TableIcon } from '../icons';
import { BlockCallout, ToggleRow, INPUT_SM_CLASS } from '../ui';
import type { DocBlockProps, FindingsTableContent } from '../types';

export function FindingsTableBlock({ content, onChange, isReadOnly }: DocBlockProps<FindingsTableContent>) {
  return (
    <div className="space-y-3">
      <BlockCallout
        tone="blue"
        icon={<TableIcon className="h-5 w-5" />}
        title="Bevindingentabel"
        subtitle="Automatisch gevuld met inspectie-bevindingen"
      />
      {!isReadOnly && (
        <div className="space-y-3 px-1">
          <ToggleRow
            label="Toon classificatie"
            checked={content.showClassification ?? true}
            onChange={(v) => onChange({ ...content, showClassification: v })}
          />
          <ToggleRow
            label="Toon normreferentie"
            checked={content.showNormReference ?? true}
            onChange={(v) => onChange({ ...content, showNormReference: v })}
          />
          <ToggleRow
            label="Toon foto's"
            checked={content.showPhotos ?? true}
            onChange={(v) => onChange({ ...content, showPhotos: v })}
          />
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-600">Groeperen op</label>
            <select
              value={content.groupBy ?? 'none'}
              onChange={(e) => onChange({ ...content, groupBy: e.target.value as FindingsTableContent['groupBy'] })}
              className={`w-40 ${INPUT_SM_CLASS}`}
            >
              <option value="none">Geen groepering</option>
              <option value="asset">Per asset</option>
              <option value="classification">Per classificatie</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
