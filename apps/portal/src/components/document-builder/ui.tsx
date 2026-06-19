// ===========================================
// Document Builder — Gedeelde block-UI helpers
// ===========================================
//
// De Beheer-portal heeft geen `.input` CSS-class of `cn()`-helper; deze module
// centraliseert de styling + herhaalde controls die de blocks gebruiken.

import type { ReactNode } from 'react';

/** Standaard input/select styling (komt overeen met de overige portal-velden). */
export const INPUT_CLASS =
  'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50';

/** Compacte variant voor inline controls in de block-instellingen. */
export const INPUT_SM_CLASS =
  'rounded-md border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

/** Aan/uit-schakelaar (rij met label links, switch rechts). */
export function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-600">{label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-primary-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

const TONES: Record<string, string> = {
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
  green: 'bg-green-50 border-green-200 text-green-800',
  purple: 'bg-purple-50 border-purple-200 text-purple-800',
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  gray: 'bg-gray-50 border-gray-200 text-gray-700',
};

/** Gekleurde kop-banner voor de inspectie-blocks (read-only weergave + uitleg). */
export function BlockCallout({
  tone,
  icon,
  title,
  subtitle,
}: {
  tone: keyof typeof TONES | string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-4 py-3 ${TONES[tone] ?? TONES.gray}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs opacity-75">{subtitle}</p>}
      </div>
    </div>
  );
}
