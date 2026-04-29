import { useEmailTemplateTypes } from '../hooks/use-email-templates';
import type { EmailTemplateType } from '@/types';

interface PlaceholderPanelProps {
  templateType: EmailTemplateType;
  onInsert: (placeholder: string) => void;
}

export function PlaceholderPanel({ templateType, onInsert }: PlaceholderPanelProps) {
  const { data: types } = useEmailTemplateTypes();
  const typeInfo = types?.find((t) => t.type === templateType);

  if (!typeInfo) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Beschikbare variabelen</h3>
      <p className="text-xs text-gray-500">
        Klik op een variabele om deze in te voegen op de cursorpositie.
      </p>
      {typeInfo.placeholders.map((group) => (
        <div key={group.entity}>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            {group.label}
          </h4>
          <div className="space-y-0.5">
            {group.fields.map((field) => {
              const placeholder = `{{${group.entity}.${field.key}}}`;
              return (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => onInsert(placeholder)}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-700 transition-colors"
                >
                  <code className="text-xs text-primary-600 bg-primary-50 px-1 py-0.5 rounded">
                    {placeholder}
                  </code>
                  <span className="ml-2 text-gray-500 text-xs">{field.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
