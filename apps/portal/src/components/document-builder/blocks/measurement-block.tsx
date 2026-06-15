// ===========================================
// MeasurementBlock — Meetgegevens-configuratie
// ===========================================

import { ChartIcon } from '../icons';
import { BlockCallout, ToggleRow } from '../ui';
import type { DocBlockProps, MeasurementDataContent } from '../types';

export function MeasurementBlock({ content, onChange, isReadOnly }: DocBlockProps<MeasurementDataContent>) {
  return (
    <div className="space-y-3">
      <BlockCallout
        tone="purple"
        icon={<ChartIcon className="h-5 w-5" />}
        title="Meetgegevens"
        subtitle="Meetresultaten uit meetbladen"
      />
      {!isReadOnly && (
        <div className="space-y-3 px-1">
          <ToggleRow
            label="Toon geslaagd/gezakt"
            checked={content.showPassFail ?? true}
            onChange={(v) => onChange({ ...content, showPassFail: v })}
          />
          <ToggleRow
            label="Toon notities"
            checked={content.showNotes ?? true}
            onChange={(v) => onChange({ ...content, showNotes: v })}
          />
        </div>
      )}
    </div>
  );
}
