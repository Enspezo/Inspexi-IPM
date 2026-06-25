import { StatusBadge } from '@/components/ui';
import { MEETMIDDEL_KALIBRATIE_STATUS } from '@/lib/status';
import type { MeasurementInstrument } from '@/types';

interface InstrumentMultiSelectProps {
  instruments: MeasurementInstrument[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/** Checkbox-lijst voor het kiezen van meetmiddelen (defaults + gebruikte meetmiddelen). */
export function InstrumentMultiSelect({
  instruments,
  selectedIds,
  onChange,
  disabled,
}: InstrumentMultiSelectProps) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  };

  if (instruments.length === 0) {
    return <p className="text-sm text-gray-500">Geen meetmiddelen beschikbaar.</p>;
  }

  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
      {instruments.map((m) => (
        <label
          key={m.id}
          className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-gray-50"
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(m.id)}
            onChange={() => toggle(m.id)}
            disabled={disabled}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="flex-1 text-sm text-gray-900">
            {m.code} — {m.brand} {m.type}
            {!m.assignedToUserId && <span className="ml-1 text-xs text-gray-400">(op voorraad)</span>}
          </span>
          <StatusBadge
            map={MEETMIDDEL_KALIBRATIE_STATUS}
            status={m.calibrationStatus ?? 'GEEN_KALIBRATIE'}
          />
        </label>
      ))}
    </div>
  );
}
