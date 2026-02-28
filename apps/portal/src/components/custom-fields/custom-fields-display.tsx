import { useCustomFieldsByEntityType } from '@/pages/organization/hooks/use-custom-fields';
import type { CustomFieldEntityType, CustomFieldType } from '@/types';

interface CustomFieldsDisplayProps {
  entityType: CustomFieldEntityType;
  customFields: Record<string, any> | null;
}

function formatValue(value: unknown, fieldType: CustomFieldType): string {
  if (value === null || value === undefined || value === '') return '\u2014';

  switch (fieldType) {
    case 'TEXT':
      return String(value);
    case 'NUMBER':
      return Number(value).toLocaleString('nl-NL');
    case 'DATE':
      return new Date(value as string).toLocaleDateString('nl-NL');
    case 'BOOLEAN':
      return value ? 'Ja' : 'Nee';
    case 'SELECT':
      return String(value);
    default:
      return String(value);
  }
}

export function CustomFieldsDisplay({ entityType, customFields }: CustomFieldsDisplayProps) {
  const { data: definitions } = useCustomFieldsByEntityType(entityType);

  if (!definitions || definitions.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Eigen velden</h3>
      <dl className="grid grid-cols-2 gap-4">
        {definitions.map((def) => (
          <div key={def.id}>
            <dt className="text-xs font-medium text-gray-500">{def.label}</dt>
            <dd className="mt-0.5 text-sm text-gray-900">
              {formatValue(customFields?.[def.fieldName], def.fieldType)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
