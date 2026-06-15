// ===========================================
// AssetSummaryBlock — Installatie-overzicht-configuratie
// ===========================================

import { PackageIcon } from '../icons';
import { BlockCallout, ToggleRow } from '../ui';
import type { DocBlockProps, AssetSummaryContent } from '../types';

export function AssetSummaryBlock({ content, onChange, isReadOnly }: DocBlockProps<AssetSummaryContent>) {
  const maxDepth = content.maxDepth ?? 3;

  return (
    <div className="space-y-3">
      <BlockCallout
        tone="green"
        icon={<PackageIcon className="h-5 w-5" />}
        title="Installatie-overzicht"
        subtitle="Samenvatting van alle geïnspecteerde assets"
      />
      {!isReadOnly && (
        <div className="space-y-3 px-1">
          <ToggleRow
            label="Toon technische gegevens"
            checked={content.showTechnicalData ?? true}
            onChange={(v) => onChange({ ...content, showTechnicalData: v })}
          />
          <ToggleRow
            label="Toon bevindingen"
            checked={content.showFindings ?? true}
            onChange={(v) => onChange({ ...content, showFindings: v })}
          />
          <ToggleRow
            label="Toon meetgegevens"
            checked={content.showMeasurements ?? true}
            onChange={(v) => onChange({ ...content, showMeasurements: v })}
          />
          <div className="flex items-center justify-between gap-4">
            <label className="whitespace-nowrap text-xs text-gray-600">Max. diepte: {maxDepth}</label>
            <input
              type="range"
              value={maxDepth}
              min={1}
              max={6}
              step={1}
              onChange={(e) => onChange({ ...content, maxDepth: parseInt(e.target.value, 10) })}
              className="max-w-40 flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
