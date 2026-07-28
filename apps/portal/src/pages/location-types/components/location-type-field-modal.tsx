// Aanmaak/bewerk-modal voor een locatie-type-veld. Spiegelt asset-type-field-modal:
// useForm + zodResolver, seed in useEffect bij open, create vs update conditioneel.
// Bevat een pragmatische validationRules-editor afhankelijk van het veldtype.

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { AssetFieldType, type LocationTypeField } from '@/types';
import { useCreateLocationTypeField, useUpdateLocationTypeField } from '../hooks/use-location-types';

const FIELD_TYPE_OPTIONS: { value: AssetFieldType; label: string }[] = [
  { value: AssetFieldType.text, label: 'Tekst' },
  { value: AssetFieldType.number, label: 'Getal' },
  { value: AssetFieldType.select, label: 'Keuze' },
  { value: AssetFieldType.checkbox, label: 'Checkbox' },
  { value: AssetFieldType.date, label: 'Datum' },
  { value: AssetFieldType.textarea, label: 'Tekstvak' },
];

const schema = z.object({
  fieldKey: z
    .string()
    .min(1, 'Sleutel is verplicht')
    .regex(/^[a-z0-9_]+$/, 'alleen kleine letters, cijfers en _'),
  label: z.string().min(1, 'Label is verplicht'),
  fieldType: z.nativeEnum(AssetFieldType),
  isRequired: z.boolean().optional(),
  description: z.string().optional(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.string().optional(),
  unit: z.string().optional(),
  groupName: z.string().optional(),
  displayWidth: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  locationTypeId: string;
  /** Bestaand veld → bewerk-modus; afwezig → aanmaak-modus. */
  field?: LocationTypeField | null;
}

export function LocationTypeFieldModal({ isOpen, onClose, locationTypeId, field }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateLocationTypeField(locationTypeId);
  const updateMutation = useUpdateLocationTypeField(locationTypeId);
  const isEdit = !!field;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const fieldType = watch('fieldType');

  // validationRules-editor state (los van react-hook-form omdat de vorm dynamisch is)
  const [options, setOptions] = useState<string[]>([]);
  const [numRules, setNumRules] = useState<{ min: string; max: string; step: string }>({
    min: '',
    max: '',
    step: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    const rules = (field?.validationRules ?? {}) as Record<string, unknown>;
    reset({
      fieldKey: field?.fieldKey ?? '',
      label: field?.label ?? '',
      fieldType: field?.fieldType ?? AssetFieldType.text,
      isRequired: field?.isRequired ?? false,
      description: field?.description ?? '',
      helpText: field?.helpText ?? '',
      placeholder: field?.placeholder ?? '',
      defaultValue: field?.defaultValue ?? '',
      unit: field?.unit ?? '',
      groupName: field?.groupName ?? '',
      displayWidth: field?.displayWidth ?? '',
    });
    setOptions(Array.isArray(rules.options) ? (rules.options as string[]) : []);
    setNumRules({
      min: rules.min != null ? String(rules.min) : '',
      max: rules.max != null ? String(rules.max) : '',
      step: rules.step != null ? String(rules.step) : '',
    });
  }, [isOpen, field, reset]);

  const buildValidationRules = (type: AssetFieldType): Record<string, unknown> => {
    if (type === AssetFieldType.select) {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      return cleaned.length ? { options: cleaned } : {};
    }
    if (type === AssetFieldType.number) {
      const rules: Record<string, number> = {};
      if (numRules.min !== '') rules.min = Number(numRules.min);
      if (numRules.max !== '') rules.max = Number(numRules.max);
      if (numRules.step !== '') rules.step = Number(numRules.step);
      return rules;
    }
    return {};
  };

  const onSubmit = async (data: FormData) => {
    const validationRules = buildValidationRules(data.fieldType);
    try {
      if (isEdit && field) {
        // fieldKey is immutable → niet meesturen op update.
        await updateMutation.mutateAsync({
          fieldId: field.id,
          data: {
            label: data.label,
            fieldType: data.fieldType,
            isRequired: data.isRequired ?? false,
            description: data.description || null,
            helpText: data.helpText || null,
            placeholder: data.placeholder || null,
            defaultValue: data.defaultValue || null,
            unit: data.unit || null,
            groupName: data.groupName || null,
            displayWidth: data.displayWidth || null,
            validationRules,
          },
        });
        showToast('Veld bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({
          fieldKey: data.fieldKey,
          label: data.label,
          fieldType: data.fieldType,
          isRequired: data.isRequired ?? false,
          description: data.description || undefined,
          helpText: data.helpText || undefined,
          placeholder: data.placeholder || undefined,
          defaultValue: data.defaultValue || undefined,
          unit: data.unit || undefined,
          groupName: data.groupName || undefined,
          displayWidth: data.displayWidth || undefined,
          validationRules,
        });
        showToast('Veld toegevoegd', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Veld bewerken' : 'Veld toevoegen'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Sleutel"
            placeholder="bijv. verdieping"
            error={errors.fieldKey?.message}
            disabled={isEdit}
            {...register('fieldKey')}
          />
          <Input label="Label" placeholder="Weergavenaam" error={errors.label?.message} {...register('label')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Veldtype" options={FIELD_TYPE_OPTIONS} {...register('fieldType')} />
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                {...register('isRequired')}
              />
              Verplicht veld
            </label>
          </div>
        </div>

        {/* validationRules — keuze: opties-lijst */}
        {fieldType === AssetFieldType.select && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Keuzeopties</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOptions((o) => [...o, ''])}>
                + Optie
              </Button>
            </div>
            {options.length === 0 && <p className="text-sm text-gray-500">Nog geen opties.</p>}
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    placeholder={`Optie ${idx + 1}`}
                    onChange={(e) =>
                      setOptions((arr) => arr.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOptions((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    Verwijder
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* validationRules — getal: min/max/step */}
        {fieldType === AssetFieldType.number && (
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <Input
              label="Min"
              type="number"
              value={numRules.min}
              onChange={(e) => setNumRules((r) => ({ ...r, min: e.target.value }))}
            />
            <Input
              label="Max"
              type="number"
              value={numRules.max}
              onChange={(e) => setNumRules((r) => ({ ...r, max: e.target.value }))}
            />
            <Input
              label="Stap"
              type="number"
              value={numRules.step}
              onChange={(e) => setNumRules((r) => ({ ...r, step: e.target.value }))}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Placeholder" {...register('placeholder')} />
          <Input label="Standaardwaarde" {...register('defaultValue')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Eenheid" placeholder="bijv. m², m" {...register('unit')} />
          <Input label="Groep" placeholder="bijv. Afmetingen" {...register('groupName')} />
        </div>

        <Input label="Weergavebreedte" placeholder="bijv. full, half" {...register('displayWidth')} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Helptekst</label>
          <textarea
            {...register('helpText')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
