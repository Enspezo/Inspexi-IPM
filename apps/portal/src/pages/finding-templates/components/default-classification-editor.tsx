// Bewerkbare standaardclassificatie: per kenmerk van het gekozen classificatiemodel een
// Select met de opties (value=optieCode, label=optienaam + kleurzwatch). De gecombineerde
// waarde is { [kenmerkCode]: optieCode }. Wordt gebruikt door zowel de detailpagina als de
// aanmaak-modal. Bij modelwissel worden keys die niet meer bestaan opgeschoond door de
// useEffect in de parent (value wordt opnieuw gezet).

import { useClassificationModelDetail } from '../hooks/use-finding-templates';
import { Spinner } from '@/components/ui';

interface Props {
  classificationModelId: string | null | undefined;
  /** Huidige selectie: { kenmerkCode: optieCode }. */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export function DefaultClassificationEditor({ classificationModelId, value, onChange }: Props) {
  const { data: model, isLoading } = useClassificationModelDetail(classificationModelId);

  if (!classificationModelId) {
    return (
      <p className="text-sm text-gray-500">
        Kies eerst een classificatiemodel om de standaardclassificatie in te stellen.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-16 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  const characteristics = model?.characteristics ?? [];

  if (characteristics.length === 0) {
    return <p className="text-sm text-gray-500">Dit model heeft geen kenmerken.</p>;
  }

  const setCharacteristic = (charCode: string, optionCode: string) => {
    const next = { ...value };
    if (optionCode) {
      next[charCode] = optionCode;
    } else {
      delete next[charCode];
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {characteristics.map((char) => {
        const options = char.options ?? [];
        const selected = value[char.code] ?? '';
        return (
          <div key={char.id}>
            <label className="mb-1 block text-sm font-medium text-gray-700">{char.name}</label>
            <select
              value={selected}
              onChange={(e) => setCharacteristic(char.code, e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="">— Geen keuze —</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.code}>
                  {opt.name}
                </option>
              ))}
            </select>
            {selected && (
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                {(() => {
                  const opt = options.find((o) => o.code === selected);
                  if (!opt) return <span>{selected}</span>;
                  return (
                    <>
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-gray-200"
                        style={{ backgroundColor: opt.color }}
                      />
                      {opt.name}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
