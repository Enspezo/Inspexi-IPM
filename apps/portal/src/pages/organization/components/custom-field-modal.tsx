import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Checkbox, Button, useToast } from '@/components/ui';
import {
  useCreateCustomField,
  useUpdateCustomField,
} from '../hooks/use-custom-fields';
import { CustomFieldType, CustomFieldEntityType } from '@/types';
import type { CustomFieldDefinition } from '@/types';

const FIELD_TYPE_OPTIONS = [
  { value: CustomFieldType.TEXT, label: 'Tekst' },
  { value: CustomFieldType.NUMBER, label: 'Getal' },
  { value: CustomFieldType.DATE, label: 'Datum' },
  { value: CustomFieldType.BOOLEAN, label: 'Ja/Nee' },
  { value: CustomFieldType.SELECT, label: 'Keuzelijst' },
];

const fieldSchema = z.object({
  label: z.string().min(1, 'Label is verplicht'),
  fieldType: z.nativeEnum(CustomFieldType),
  isRequired: z.boolean(),
  options: z.array(z.object({ value: z.string().min(1, 'Optie mag niet leeg zijn') })).optional(),
}).refine(
  (data) => {
    if (data.fieldType === CustomFieldType.SELECT) {
      return data.options && data.options.length >= 1;
    }
    return true;
  },
  { message: 'Voeg minimaal 1 optie toe', path: ['options'] },
);

type FieldFormData = z.infer<typeof fieldSchema>;

interface CustomFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingField?: CustomFieldDefinition;
  entityType: CustomFieldEntityType;
}

export function CustomFieldModal({
  isOpen,
  onClose,
  existingField,
  entityType,
}: CustomFieldModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateCustomField();
  const updateMutation = useUpdateCustomField(existingField?.id ?? '');
  const isEdit = Boolean(existingField);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<FieldFormData>({
    resolver: zodResolver(fieldSchema),
    defaultValues: {
      label: '',
      fieldType: CustomFieldType.TEXT,
      isRequired: false,
      options: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'options',
  });

  const watchFieldType = watch('fieldType');

  useEffect(() => {
    if (isOpen) {
      if (existingField) {
        reset({
          label: existingField.label,
          fieldType: existingField.fieldType,
          isRequired: existingField.isRequired,
          options: existingField.options?.map((o) => ({ value: o })) ?? [],
        });
      } else {
        reset({
          label: '',
          fieldType: CustomFieldType.TEXT,
          isRequired: false,
          options: [],
        });
      }
    }
  }, [isOpen, existingField, reset]);

  const onSubmit = async (data: FieldFormData) => {
    try {
      const options =
        data.fieldType === CustomFieldType.SELECT
          ? data.options?.map((o) => o.value)
          : undefined;

      if (isEdit && existingField) {
        await updateMutation.mutateAsync({
          label: data.label,
          isRequired: data.isRequired,
          options,
        });
        showToast('Eigen veld bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({
          entityType,
          label: data.label,
          fieldType: data.fieldType,
          isRequired: data.isRequired,
          options,
        });
        showToast('Eigen veld aangemaakt', 'success');
      }
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Er is een fout opgetreden',
        'error',
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Eigen veld bewerken' : 'Eigen veld toevoegen'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Label"
          placeholder="Bijv. Certificaatnummer"
          error={errors.label?.message}
          {...register('label')}
        />

        <Select
          label="Veldtype"
          options={FIELD_TYPE_OPTIONS}
          disabled={isEdit}
          error={errors.fieldType?.message}
          {...register('fieldType')}
        />

        <Checkbox
          label="Verplicht"
          {...register('isRequired')}
        />

        {watchFieldType === CustomFieldType.SELECT && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Opties
            </label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  placeholder={`Optie ${index + 1}`}
                  error={errors.options?.[index]?.value?.message}
                  {...register(`options.${index}.value`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  className="flex-shrink-0 text-red-500 hover:text-red-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            ))}
            {errors.options?.root?.message && (
              <p className="text-sm text-red-600">{errors.options.root.message}</p>
            )}
            {typeof errors.options?.message === 'string' && (
              <p className="text-sm text-red-600">{errors.options.message}</p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => append({ value: '' })}
            >
              + Optie toevoegen
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
