import { useState } from 'react';

interface PlaceholderField {
  key: string;
  label: string;
}

interface PlaceholderGroup {
  entity: string;
  label: string;
  fields: PlaceholderField[];
}

const QUOTE_PLACEHOLDERS: PlaceholderGroup[] = [
  {
    entity: 'organisatie',
    label: 'Organisatie',
    fields: [
      { key: 'naam', label: 'Organisatienaam' },
      { key: 'email', label: 'E-mailadres' },
    ],
  },
  {
    entity: 'contact',
    label: 'Contact',
    fields: [
      { key: 'bedrijfsnaam', label: 'Bedrijfsnaam' },
      { key: 'voornaam', label: 'Voornaam' },
      { key: 'achternaam', label: 'Achternaam' },
      { key: 'email', label: 'E-mailadres' },
    ],
  },
  {
    entity: 'offerte',
    label: 'Offerte',
    fields: [
      { key: 'nummer', label: 'Offertenummer' },
      { key: 'onderwerp', label: 'Onderwerp' },
      { key: 'totaal', label: 'Totaalbedrag' },
      { key: 'vervalDatum', label: 'Vervaldatum' },
      { key: 'url', label: 'Klantportaal URL' },
    ],
  },
  {
    entity: 'gebruiker',
    label: 'Gebruiker',
    fields: [
      { key: 'voornaam', label: 'Voornaam' },
      { key: 'achternaam', label: 'Achternaam' },
      { key: 'email', label: 'E-mailadres' },
    ],
  },
];

interface QuoteTemplatePlaceholderPanelProps {
  onInsert: (placeholder: string) => void;
  /** When true, shows [[...]] syntax and copies to clipboard instead of inserting */
  rtfMode?: boolean;
}

export function QuoteTemplatePlaceholderPanel({ onInsert, rtfMode }: QuoteTemplatePlaceholderPanelProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleClick = (entity: string, fieldKey: string) => {
    if (rtfMode) {
      const placeholder = `[[${entity}.${fieldKey}]]`;
      navigator.clipboard.writeText(placeholder).then(() => {
        setCopiedKey(`${entity}.${fieldKey}`);
        setTimeout(() => setCopiedKey(null), 1500);
      });
    } else {
      onInsert(`{{${entity}.${fieldKey}}}`);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Variabelen</h3>
      <p className="text-xs text-gray-500 mb-3">
        {rtfMode
          ? 'Klik om een variabele naar het klembord te kopiëren. Plak deze in uw RTF bestand.'
          : 'Klik op een variabele om deze in te voegen in het actieve tekstblok.'}
      </p>

      {rtfMode && (
        <div className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          <strong>Verplicht:</strong> Uw RTF bestand moet <code className="bg-amber-100 px-1 rounded">[[offerteregels]]</code> of <code className="bg-amber-100 px-1 rounded">[[quote_lines]]</code> bevatten.
        </div>
      )}

      <div className="space-y-1">
        {QUOTE_PLACEHOLDERS.map((group) => (
          <div key={group.entity}>
            <button
              type="button"
              onClick={() =>
                setExpandedGroup(expandedGroup === group.entity ? null : group.entity)
              }
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>{group.label}</span>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${
                  expandedGroup === group.entity ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedGroup === group.entity && (
              <div className="ml-2 space-y-0.5 pb-1">
                {group.fields.map((field) => {
                  const displayCode = rtfMode
                    ? `[[${field.key}]]`
                    : `{{${field.key}}}`;
                  const fullKey = `${group.entity}.${field.key}`;
                  const isCopied = copiedKey === fullKey;
                  return (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => handleClick(group.entity, field.key)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-gray-600 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                      title={rtfMode ? `Kopiëren: [[${fullKey}]]` : `Invoegen: {{${fullKey}}}`}
                    >
                      <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px]">
                        {displayCode}
                      </code>
                      <span className="flex-1 text-left">{field.label}</span>
                      {isCopied && (
                        <span className="text-green-600 text-[10px]">Gekopieerd!</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
