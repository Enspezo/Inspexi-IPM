import type { ReactNode } from 'react';

export interface TabDef<K extends string = string> {
  key: K;
  label: string;
  /** Optionele teller-badge (alleen getoond als > 0) */
  count?: number;
  icon?: ReactNode;
}

interface TabsProps<K extends string> {
  tabs: ReadonlyArray<TabDef<K>>;
  active: K;
  onChange: (key: K) => void;
}

/**
 * Uniforme tab-navigatie voor detail- en overzichtspagina's.
 * Render de tab-inhoud zelf onder de <Tabs> op basis van `active`.
 */
export function Tabs<K extends string>({ tabs, active, onChange }: TabsProps<K>) {
  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              active === tab.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-100 px-1.5 text-xs font-semibold text-primary-700">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
