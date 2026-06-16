// Read-only weergave van Asset.technicalData (een vrije Record<string, unknown>).
// Rendert key → value als definitielijst; waarden netjes geformatteerd
// (boolean → Ja/Nee, object/array → JSON, null/leeg → '—'). Lege data → empty-state.

interface TechnicalDataListProps {
  data: Record<string, unknown> | null | undefined;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function TechnicalDataList({ data }: TechnicalDataListProps) {
  const entries = data ? Object.entries(data) : [];

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">Geen technische gegevens vastgelegd.</p>;
  }

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-sm font-medium text-gray-500 break-words">{key}</dt>
          <dd className="mt-1 text-sm text-gray-900 break-words">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
