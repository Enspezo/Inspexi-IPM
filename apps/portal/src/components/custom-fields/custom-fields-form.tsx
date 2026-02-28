import { type UseFormRegister, type FieldErrors, type Control, Controller } from 'react-hook-form';
import { Input, Select, Checkbox } from '@/components/ui';
import { useCustomFieldsByEntityType } from '@/pages/organization/hooks/use-custom-fields';
import type { CustomFieldEntityType, CustomFieldDefinition } from '@/types';

interface CustomFieldsFormProps {
  entityType: CustomFieldEntityType;
  register: UseFormRegister<any>;
  errors: FieldErrors;
  control: Control<any>;
  namePrefix?: string;
}

function getFieldError(errors: FieldErrors, prefix: string, fieldName: string): string | undefined {
  const prefixErrors = errors[prefix] as Record<string, any> | undefined;
  return prefixErrors?.[fieldName]?.message as string | undefined;
}

function renderField(
  def: CustomFieldDefinition,
  prefix: string,
  register: UseFormRegister<any>,
  errors: FieldErrors,
  control: Control<any>,
) {
  const fieldPath = `${prefix}.${def.fieldName}` as const;
  const error = getFieldError(errors, prefix, def.fieldName);

  switch (def.fieldType) {
    case 'TEXT':
      return (
        <Input
          key={def.id}
          label={def.label}
          error={error}
          {...register(fieldPath)}
        />
      );

    case 'NUMBER':
      return (
        <Input
          key={def.id}
          type="number"
          step="any"
          label={def.label}
          error={error}
          {...register(fieldPath, { valueAsNumber: true })}
        />
      );

    case 'DATE':
      return (
        <Input
          key={def.id}
          type="date"
          label={def.label}
          error={error}
          {...register(fieldPath)}
        />
      );

    case 'BOOLEAN':
      return (
        <Controller
          key={def.id}
          name={fieldPath}
          control={control}
          render={({ field }) => (
            <Checkbox
              label={def.label}
              checked={!!field.value}
              onChange={(e) => field.onChange((e.target as HTMLInputElement).checked)}
            />
          )}
        />
      );

    case 'SELECT':
      return (
        <Controller
          key={def.id}
          name={fieldPath}
          control={control}
          render={({ field }) => (
            <Select
              label={def.label}
              options={(def.options ?? []).map((o) => ({ value: o, label: o }))}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              error={error}
              placeholder="Selecteer..."
            />
          )}
        />
      );

    default:
      return null;
  }
}

export function CustomFieldsForm({
  entityType,
  register,
  errors,
  control,
  namePrefix = 'customFields',
}: CustomFieldsFormProps) {
  const { data: definitions } = useCustomFieldsByEntityType(entityType);

  if (!definitions || definitions.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Eigen velden</h3>
      <div className="grid grid-cols-2 gap-4">
        {definitions.map((def) => renderField(def, namePrefix, register, errors, control))}
      </div>
    </div>
  );
}
