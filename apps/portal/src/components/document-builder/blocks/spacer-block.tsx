// ===========================================
// SpacerBlock — Verticale ruimte
// ===========================================

import type { DocBlockProps, SpacerContent } from '../types';

export function SpacerBlock({ content, onChange, isReadOnly }: DocBlockProps<SpacerContent>) {
  const height = content.height ?? 32;

  return (
    <div>
      <div
        className="flex w-full items-center justify-center rounded border border-dashed border-gray-300 bg-gray-100/50 text-xs text-gray-400"
        style={{ height: `${height}px`, minHeight: '16px' }}
      >
        {!isReadOnly && `${height}px ruimte`}
      </div>
      {!isReadOnly && (
        <div className="mt-2 flex items-center gap-3">
          <label className="whitespace-nowrap text-xs text-gray-500">Hoogte: {height}px</label>
          <input
            type="range"
            value={height}
            min={8}
            max={200}
            step={8}
            onChange={(e) => onChange({ ...content, height: parseInt(e.target.value, 10) })}
            className="max-w-48 flex-1"
          />
        </div>
      )}
    </div>
  );
}
