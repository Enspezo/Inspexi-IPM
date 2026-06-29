// Dynamisch formulier voor de `technicalData` van een node, gedreven door de
// veld-definities van een asset-/locatie-type (AssetTypeField | LocationTypeField).
// Beide field-vormen delen dezelfde relevante velden, dus we typen structureel.
import { AssetFieldType } from '@/types';
import { Input, Select } from '@/components/ui';

export interface TechnicalField {
  fieldKey: string;
  label: string;
  fieldType: AssetFieldType;
  isRequired: boolean;
  unit: string | null;
  placeholder: string | null;
  helpText: string | null;
  validationRules: Record<string, unknown>;
}

interface TechnicalDataFormProps {
  fields: TechnicalField[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

function selectOptions(field: TechnicalField): string[] {
  const opts = field.validationRules?.options;
  return Array.isArray(opts) ? (opts as string[]) : [];
}

/** Render één veld op basis van zijn type. */
function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: TechnicalField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;

  switch (field.fieldType) {
    case AssetFieldType.checkbox:
      return (
        <label className="flex items-center gap-2 py-1.5">
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </label>
      );
    case AssetFieldType.select:
      return (
        <Select
          label={label}
          disabled={disabled}
          placeholder="— Kies —"
          options={selectOptions(field).map((o) => ({ value: o, label: o }))}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case AssetFieldType.textarea:
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <textarea
            rows={3}
            disabled={disabled}
            placeholder={field.placeholder ?? ''}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      );
    case AssetFieldType.number:
      return (
        <Input
          label={label}
          type="number"
          disabled={disabled}
          placeholder={field.placeholder ?? ''}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case AssetFieldType.date:
      return (
        <Input
          label={label}
          type="date"
          disabled={disabled}
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case AssetFieldType.text:
    default:
      return (
        <Input
          label={label}
          disabled={disabled}
          placeholder={field.placeholder ?? ''}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function TechnicalDataForm({ fields, value, onChange, disabled }: TechnicalDataFormProps) {
  if (fields.length === 0) {
    return <p className="text-sm text-gray-400">Dit type heeft geen technische velden gedefinieerd.</p>;
  }

  const setField = (key: string, v: unknown) => {
    const next = { ...value };
    if (v === null || v === undefined || v === '') delete next[key];
    else next[key] = v;
    onChange(next);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.fieldKey}>
          <FieldControl
            field={field}
            value={value[field.fieldKey]}
            onChange={(v) => setField(field.fieldKey, v)}
            disabled={disabled}
          />
          {field.helpText && <p className="mt-1 text-xs text-gray-400">{field.helpText}</p>}
        </div>
      ))}
    </div>
  );
}
