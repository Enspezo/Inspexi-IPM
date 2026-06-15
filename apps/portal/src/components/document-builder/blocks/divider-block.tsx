// ===========================================
// DividerBlock — Horizontale scheidingslijn
// ===========================================

import { INPUT_SM_CLASS } from '../ui';
import type { DocBlockProps, DividerContent } from '../types';

export function DividerBlock({ content, onChange, isReadOnly }: DocBlockProps<DividerContent>) {
  const style = content.style ?? 'solid';
  const color = content.color ?? '#e5e7eb';

  return (
    <div className="space-y-2">
      <hr style={{ borderStyle: style, borderColor: color, borderTopWidth: '1px' }} className="my-2" />
      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="whitespace-nowrap text-xs text-gray-500">Stijl</label>
            <select
              value={style}
              onChange={(e) => onChange({ ...content, style: e.target.value as DividerContent['style'] })}
              className={INPUT_SM_CLASS}
            >
              <option value="solid">Doorgetrokken</option>
              <option value="dashed">Streepjes</option>
              <option value="dotted">Puntjes</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="whitespace-nowrap text-xs text-gray-500">Kleur</label>
            <input
              type="color"
              value={color}
              onChange={(e) => onChange({ ...content, color: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-gray-200 p-0.5"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => onChange({ ...content, color: e.target.value })}
              className={`w-24 font-mono ${INPUT_SM_CLASS}`}
              placeholder="#e5e7eb"
            />
          </div>
        </div>
      )}
    </div>
  );
}
