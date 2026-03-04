import { useState } from 'react';

interface PlaceholderField {
  key: string;
  label: string;
  /** Full code override (for loop tags etc.) */
  code?: string;
  /** Whether this is a structural tag (loop start/end) */
  isTag?: boolean;
}

interface PlaceholderGroup {
  entity: string;
  label: string;
  description?: string;
  fields: PlaceholderField[];
}

const QUOTE_PLACEHOLDERS: PlaceholderGroup[] = [
  {
    entity: 'organisatie',
    label: 'Organisatie',
    fields: [
      { key: 'naam', label: 'Organisatienaam' },
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
      { key: 'datum', label: 'Datum' },
      { key: 'geldig_tot', label: 'Geldig tot' },
      { key: 'subtotaal', label: 'Subtotaal' },
      { key: 'korting_totaal', label: 'Korting totaal' },
      { key: 'btw_totaal', label: 'BTW totaal' },
      { key: 'totaal', label: 'Totaal incl. BTW' },
    ],
  },
  {
    entity: 'afzender',
    label: 'Afzender',
    fields: [
      { key: 'voornaam', label: 'Voornaam' },
      { key: 'achternaam', label: 'Achternaam' },
      { key: 'email', label: 'E-mailadres' },
    ],
  },
];

const DOCX_TABLE_GROUP: PlaceholderGroup = {
  entity: '_offerteregels',
  label: 'Offerteregels (tabel)',
  description: 'Gebruik in een Word-tabel. De rij wordt herhaald per offerteregel.',
  fields: [
    { key: '#offerteregels', label: 'Loop start', code: '{{#offerteregels}}', isTag: true },
    { key: 'omschrijving', label: 'Omschrijving', code: '{{omschrijving}}' },
    { key: 'aantal', label: 'Aantal', code: '{{aantal}}' },
    { key: 'eenheid', label: 'Eenheid', code: '{{eenheid}}' },
    { key: 'stukprijs', label: 'Stukprijs', code: '{{stukprijs}}' },
    { key: 'korting', label: 'Korting %', code: '{{korting}}' },
    { key: 'btw', label: 'BTW %', code: '{{btw}}' },
    { key: 'regeltotaal', label: 'Regeltotaal', code: '{{regeltotaal}}' },
    { key: '/offerteregels', label: 'Loop einde', code: '{{/offerteregels}}', isTag: true },
  ],
};

const DOCX_TOTALS_GROUP: PlaceholderGroup = {
  entity: '_totalen',
  label: 'Totalen',
  description: 'Top-level totaalvelden voor onder de tabel.',
  fields: [
    { key: 'subtotaal', label: 'Subtotaal', code: '{{subtotaal}}' },
    { key: 'korting_totaal', label: 'Korting totaal', code: '{{korting_totaal}}' },
    { key: 'btw_totaal', label: 'BTW totaal', code: '{{btw_totaal}}' },
    { key: 'totaal', label: 'Totaal incl. BTW', code: '{{totaal}}' },
  ],
};

interface QuoteTemplatePlaceholderPanelProps {
  onInsert: (placeholder: string) => void;
  /** When true, copies to clipboard instead of inserting into editor */
  docxMode?: boolean;
}

export function QuoteTemplatePlaceholderPanel({ onInsert, docxMode }: QuoteTemplatePlaceholderPanelProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const groups = docxMode
    ? [...QUOTE_PLACEHOLDERS, DOCX_TABLE_GROUP, DOCX_TOTALS_GROUP]
    : QUOTE_PLACEHOLDERS;

  const handleClick = (group: PlaceholderGroup, field: PlaceholderField) => {
    const code = field.code ?? `{{${group.entity}.${field.key}}}`;
    if (docxMode) {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedKey(`${group.entity}.${field.key}`);
        setTimeout(() => setCopiedKey(null), 1500);
      });
    } else {
      onInsert(code);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Variabelen</h3>
      <p className="text-xs text-gray-500 mb-3">
        {docxMode
          ? 'Klik om een variabele naar het klembord te kopiëren. Plak deze in uw DOCX bestand.'
          : 'Klik op een variabele om deze in te voegen in het actieve tekstblok.'}
      </p>

      {docxMode && (
        <div className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          <strong>Offerteregels:</strong> Gebruik <code className="bg-amber-100 px-1 rounded">{`{{offerteregels}}`}</code> voor een automatisch gegenereerde tabel, of gebruik de loop-syntax <code className="bg-amber-100 px-1 rounded">{`{{#offerteregels}}`}</code>/<code className="bg-amber-100 px-1 rounded">{`{{/offerteregels}}`}</code> in een eigen tabel voor meer controle.
        </div>
      )}

      <div className="space-y-1">
        {groups.map((group) => (
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
                {group.description && (
                  <p className="text-[10px] text-gray-400 px-2 py-1">{group.description}</p>
                )}
                {group.fields.map((field) => {
                  const displayCode = field.code ?? `{{${field.key}}}`;
                  const fullKey = `${group.entity}.${field.key}`;
                  const isCopied = copiedKey === fullKey;
                  return (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => handleClick(group, field)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                        field.isTag
                          ? 'text-amber-700 hover:bg-amber-50 font-medium'
                          : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'
                      }`}
                      title={docxMode ? `Kopiëren: ${displayCode}` : `Invoegen: ${displayCode}`}
                    >
                      <code className={`rounded px-1 py-0.5 font-mono text-[10px] ${
                        field.isTag ? 'bg-amber-100' : 'bg-gray-100'
                      }`}>
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
