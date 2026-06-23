import type { FeatureDef } from '@/lib/entitlements';
import { forcedDependencies } from '@/lib/entitlements';

interface FeatureChecklistProps {
  catalog: FeatureDef[];
  /** Expliciet geselecteerde feature-keys. */
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}

/**
 * Checkbox-lijst van de feature-catalogus met visuele afhankelijkheden (PRD-09
 * §5.3). Een feature die door de dependency-closure wordt afgedwongen (omdat een
 * geselecteerde feature ervan afhangt) toont als aangevinkt + vergrendeld met een
 * "automatisch"-badge. De `selected`-array bevat alleen de expliciete keuzes; de
 * closure wordt server-side toegepast bij het resolven van een org.
 */
export function FeatureChecklist({
  catalog,
  selected,
  onChange,
  disabled,
}: FeatureChecklistProps) {
  const labelOf = (key: string) => catalog.find((f) => f.key === key)?.label ?? key;
  const forced = forcedDependencies(catalog, selected);

  const toggle = (key: string) => {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <ul className="space-y-2">
      {catalog.map((feature) => {
        const isSelected = selected.includes(feature.key);
        const isForced = forced.has(feature.key) && !isSelected;
        const checked = isSelected || isForced;
        // Een afgedwongen feature kan niet uitgezet worden zolang de afhankelijke
        // feature aanstaat.
        const rowDisabled = disabled || isForced;

        return (
          <li
            key={feature.key}
            className={`flex gap-3 rounded-lg border p-3 ${
              checked ? 'border-primary-200 bg-primary-50/40' : 'border-gray-200'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={rowDisabled}
              onChange={() => toggle(feature.key)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {feature.label}
                </span>
                <span className="font-mono text-xs text-gray-400">{feature.key}</span>
                {isForced && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    Automatisch vereist
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{feature.description}</p>
              {feature.dependsOn.length > 0 && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Vereist:{' '}
                  {feature.dependsOn.map((d) => labelOf(d)).join(', ')}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
