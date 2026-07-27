// Aanmaak/bewerk-modal voor een meetstaat-veld — het grote formulier.
// Dekt ALLE velden uit CreateMeasurementSheetFieldDto. Statische velden via react-hook-form;
// dynamische lijsten (dropdownOptions, formulaDependencies, passFailValues) als lokale state.
// `code` is immutable op bewerken. Conditioneel op fieldType / passFailEnabled /
// autoFindingEnabled / sectie.isRepeating.

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, QueryErrorNotice, Select, Checkbox, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import {
  MeasurementSheetFieldType,
  MeasurementSheetFieldWidth,
  PassFailOperator,
  type MeasurementSheetField,
  type MeasurementSheetSection,
} from '@/types';
import { useFindingTemplates } from '@/pages/finding-templates/hooks/use-finding-templates';
import { useCreateField, useUpdateField } from '../hooks/use-measurement-sheet-templates';

const FIELD_TYPE_OPTIONS: { value: MeasurementSheetFieldType; label: string }[] = [
  { value: MeasurementSheetFieldType.NUMBER, label: 'Getal' },
  { value: MeasurementSheetFieldType.TEXT, label: 'Tekst' },
  { value: MeasurementSheetFieldType.TEXTAREA, label: 'Tekstvak' },
  { value: MeasurementSheetFieldType.CHECKBOX, label: 'Checkbox' },
  { value: MeasurementSheetFieldType.DROPDOWN, label: 'Keuzelijst' },
  { value: MeasurementSheetFieldType.CALCULATED, label: 'Berekend' },
  { value: MeasurementSheetFieldType.PHOTO, label: 'Foto' },
];

const WIDTH_OPTIONS: { value: MeasurementSheetFieldWidth; label: string }[] = [
  { value: MeasurementSheetFieldWidth.QUARTER, label: '1/4' },
  { value: MeasurementSheetFieldWidth.THIRD, label: '1/3' },
  { value: MeasurementSheetFieldWidth.HALF, label: '1/2' },
  { value: MeasurementSheetFieldWidth.TWO_THIRDS, label: '2/3' },
  { value: MeasurementSheetFieldWidth.THREE_QUARTERS, label: '3/4' },
  { value: MeasurementSheetFieldWidth.FULL, label: 'Volledig' },
];

const OPERATOR_OPTIONS: { value: PassFailOperator; label: string }[] = [
  { value: PassFailOperator.EQ, label: 'Gelijk aan (=)' },
  { value: PassFailOperator.GT, label: 'Groter dan (>)' },
  { value: PassFailOperator.GTE, label: 'Groter of gelijk (≥)' },
  { value: PassFailOperator.LT, label: 'Kleiner dan (<)' },
  { value: PassFailOperator.LTE, label: 'Kleiner of gelijk (≤)' },
  { value: PassFailOperator.RANGE, label: 'Tussen (bereik)' },
  { value: PassFailOperator.IN, label: 'In lijst' },
];

/** Veldtypes waarvoor pass/fail-instellingen zinvol zijn. */
const PASS_FAIL_TYPES = new Set<MeasurementSheetFieldType>([
  MeasurementSheetFieldType.NUMBER,
  MeasurementSheetFieldType.CALCULATED,
  MeasurementSheetFieldType.DROPDOWN,
  MeasurementSheetFieldType.TEXT,
]);

const schema = z.object({
  code: z
    .string()
    .min(2, 'Minimaal 2 tekens')
    .max(50, 'Maximaal 50 tekens')
    .regex(/^[a-z0-9_]+$/, 'alleen kleine letters, cijfers en _'),
  name: z.string().min(2, 'Minimaal 2 tekens').max(200, 'Maximaal 200 tekens'),
  description: z.string().max(1000).optional(),
  fieldType: z.nativeEnum(MeasurementSheetFieldType),
  width: z.nativeEnum(MeasurementSheetFieldWidth),
  sortOrder: z.coerce.number().int().min(0).optional(),
  placeholder: z.string().max(200).optional(),
  isRequired: z.boolean().optional(),
  // Numeriek
  unit: z.string().max(20).optional(),
  decimals: z.string().optional(),
  minValue: z.string().optional(),
  maxValue: z.string().optional(),
  // Berekend
  formula: z.string().max(1000).optional(),
  // Pass/fail
  passFailEnabled: z.boolean().optional(),
  passFailOperator: z.nativeEnum(PassFailOperator).optional(),
  passFailValue: z.string().optional(),
  passFailMinValue: z.string().optional(),
  passFailMaxValue: z.string().optional(),
  passFailFailMessage: z.string().max(500).optional(),
  // Auto-constatering
  autoFindingEnabled: z.boolean().optional(),
  autoFindingTemplateId: z.string().optional(),
  // Herhalende sectie
  copyValueOnNewRow: z.boolean().optional(),
  allowBulkEdit: z.boolean().optional(),
}).superRefine((d, ctx) => {
  // B-506: min > max maakt het veld oninvulbaar in de PWA — weiger de
  // combinatie hier al in de builder (de API weigert hem ook).
  const min = num(d.minValue);
  const max = num(d.maxValue);
  if (min !== undefined && max !== undefined && max < min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxValue'],
      message: 'Maximum moet groter of gelijk zijn aan het minimum',
    });
  }
  const pfMin = num(d.passFailMinValue);
  const pfMax = num(d.passFailMaxValue);
  if (pfMin !== undefined && pfMax !== undefined && pfMax < pfMin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['passFailMaxValue'],
      message: 'Maximum moet groter of gelijk zijn aan het minimum',
    });
  }
});
type FormData = z.infer<typeof schema>;

interface DropdownOpt {
  value: string;
  label: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  section: MeasurementSheetSection;
  /** Bestaand veld → bewerk-modus; afwezig → aanmaak-modus. */
  field?: MeasurementSheetField | null;
}

/** Veilig een number teruggeven uit een tekstveld, of undefined als leeg/ongeldig. */
function num(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

export function FieldModal({ isOpen, onClose, templateId, section, field }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateField(templateId, section.id);
  const updateMutation = useUpdateField(templateId, section.id);
  const isEdit = !!field;

  // Finding-templates voor de auto-constatering Select (PAGINATED → .data).
  const {
    data: findingTemplatesPage,
    error: findingTemplatesError,
    refetch: refetchFindingTemplates,
  } = useFindingTemplates({ limit: 200 });
  const findingTemplateOptions = (findingTemplatesPage?.data ?? []).map((ft) => ({
    value: ft.id,
    label: ft.code ? `${ft.code} — ${ft.shortDescription}` : ft.shortDescription,
  }));

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const fieldType = watch('fieldType');
  const passFailEnabled = watch('passFailEnabled');
  const passFailOperator = watch('passFailOperator');
  const autoFindingEnabled = watch('autoFindingEnabled');

  // Dynamische lijsten (los van react-hook-form).
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOpt[]>([]);
  const [formulaDeps, setFormulaDeps] = useState<string[]>([]);
  const [passFailValues, setPassFailValues] = useState<string[]>([]);

  // Andere velden in dezelfde sectie — kandidaten voor formula-dependencies.
  const siblingFieldCodes = (section.fields ?? [])
    .filter((f) => !field || f.id !== field.id)
    .map((f) => f.code);

  useEffect(() => {
    if (!isOpen) return;
    reset({
      code: field?.code ?? '',
      name: field?.name ?? '',
      description: field?.description ?? '',
      fieldType: field?.fieldType ?? MeasurementSheetFieldType.NUMBER,
      width: field?.width ?? MeasurementSheetFieldWidth.FULL,
      sortOrder: field?.sortOrder ?? 0,
      placeholder: field?.placeholder ?? '',
      isRequired: field?.isRequired ?? false,
      unit: field?.unit ?? '',
      decimals: field?.decimals != null ? String(field.decimals) : '',
      minValue: field?.minValue != null ? String(field.minValue) : '',
      maxValue: field?.maxValue != null ? String(field.maxValue) : '',
      formula: field?.formula ?? '',
      passFailEnabled: field?.passFailEnabled ?? false,
      passFailOperator: field?.passFailOperator ?? PassFailOperator.GTE,
      passFailValue: field?.passFailValue != null ? String(field.passFailValue) : '',
      passFailMinValue: field?.passFailMinValue != null ? String(field.passFailMinValue) : '',
      passFailMaxValue: field?.passFailMaxValue != null ? String(field.passFailMaxValue) : '',
      passFailFailMessage: field?.passFailFailMessage ?? '',
      autoFindingEnabled: field?.autoFindingEnabled ?? false,
      autoFindingTemplateId: field?.autoFindingTemplateId ?? '',
      copyValueOnNewRow: field?.copyValueOnNewRow ?? false,
      allowBulkEdit: field?.allowBulkEdit ?? false,
    });

    // dropdownOptions kan als array of als { options: [] } object binnenkomen.
    const rawOpts = field?.dropdownOptions;
    const optsArray = Array.isArray(rawOpts)
      ? rawOpts
      : Array.isArray((rawOpts as { options?: unknown })?.options)
        ? ((rawOpts as { options: unknown[] }).options)
        : [];
    setDropdownOptions(
      optsArray
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
        .map((o) => ({ value: String(o.value ?? ''), label: String(o.label ?? '') })),
    );

    setFormulaDeps(Array.isArray(field?.formulaDependencies) ? field!.formulaDependencies : []);

    const rawPfv = field?.passFailValues;
    const pfvArray = Array.isArray(rawPfv)
      ? rawPfv
      : Array.isArray((rawPfv as { values?: unknown })?.values)
        ? ((rawPfv as { values: unknown[] }).values)
        : [];
    setPassFailValues(pfvArray.map((v) => String(v)));
  }, [isOpen, field, reset]);

  const showNumberOpts = fieldType === MeasurementSheetFieldType.NUMBER;
  const showDropdownOpts = fieldType === MeasurementSheetFieldType.DROPDOWN;
  const showCalculated = fieldType === MeasurementSheetFieldType.CALCULATED;
  const showPassFail = PASS_FAIL_TYPES.has(fieldType);
  const isRangeOp = passFailOperator === PassFailOperator.RANGE;
  const isInOp = passFailOperator === PassFailOperator.IN;

  const onSubmit = async (data: FormData) => {
    // Basis-payload (gedeeld door create + update).
    const payload: Record<string, unknown> = {
      name: data.name,
      description: data.description || undefined,
      fieldType: data.fieldType,
      width: data.width,
      sortOrder: data.sortOrder ?? 0,
      placeholder: data.placeholder || undefined,
      isRequired: data.isRequired ?? false,
    };

    // Numerieke opties
    if (data.fieldType === MeasurementSheetFieldType.NUMBER) {
      payload.unit = data.unit || undefined;
      payload.decimals = num(data.decimals);
      payload.minValue = num(data.minValue);
      payload.maxValue = num(data.maxValue);
    }

    // Dropdown-opties
    if (data.fieldType === MeasurementSheetFieldType.DROPDOWN) {
      const cleaned = dropdownOptions
        .map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
        .filter((o) => o.value && o.label);
      payload.dropdownOptions = cleaned.length ? cleaned : undefined;
    }

    // Berekend veld
    if (data.fieldType === MeasurementSheetFieldType.CALCULATED) {
      payload.formula = data.formula || undefined;
      payload.formulaDependencies = formulaDeps.length ? formulaDeps : undefined;
    }

    // Pass/fail
    if (showPassFail) {
      payload.passFailEnabled = data.passFailEnabled ?? false;
      if (data.passFailEnabled) {
        payload.passFailOperator = data.passFailOperator;
        payload.passFailFailMessage = data.passFailFailMessage || undefined;
        if (data.passFailOperator === PassFailOperator.RANGE) {
          payload.passFailMinValue = num(data.passFailMinValue);
          payload.passFailMaxValue = num(data.passFailMaxValue);
        } else if (data.passFailOperator === PassFailOperator.IN) {
          const cleaned = passFailValues.map((v) => v.trim()).filter(Boolean);
          payload.passFailValues = cleaned.length ? cleaned : undefined;
        } else {
          payload.passFailValue = num(data.passFailValue);
        }
      }
    } else {
      payload.passFailEnabled = false;
    }

    // Auto-constatering
    payload.autoFindingEnabled = data.autoFindingEnabled ?? false;
    if (data.autoFindingEnabled && data.autoFindingTemplateId) {
      payload.autoFindingTemplateId = data.autoFindingTemplateId;
    }

    // Herhalende-sectie opties (alleen relevant bij herhalende sectie)
    if (section.isRepeating) {
      payload.copyValueOnNewRow = data.copyValueOnNewRow ?? false;
      payload.allowBulkEdit = data.allowBulkEdit ?? false;
    }

    try {
      if (isEdit && field) {
        // code immutable → niet meesturen.
        await updateMutation.mutateAsync({ fieldId: field.id, data: payload });
        showToast('Veld bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({ code: data.code, ...payload });
        showToast('Veld toegevoegd', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Veld bewerken' : 'Veld toevoegen'}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {/* Basis */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            placeholder="bijv. nominale_stroom"
            error={errors.code?.message}
            disabled={isEdit}
            {...register('code')}
          />
          <Input
            label="Naam"
            placeholder="Weergavenaam"
            error={errors.name?.message}
            {...register('name')}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Veldtype" options={FIELD_TYPE_OPTIONS} {...register('fieldType')} />
          <Select label="Breedte" options={WIDTH_OPTIONS} {...register('width')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Placeholder" {...register('placeholder')} />
          <Input label="Volgorde" type="number" min={0} {...register('sortOrder')} />
        </div>

        <Checkbox label="Verplicht veld" {...register('isRequired')} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        {/* Numerieke opties */}
        {showNumberOpts && (
          <fieldset className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Numerieke opties</legend>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Input label="Eenheid" placeholder="bijv. A, V" {...register('unit')} />
              <Input label="Decimalen" type="number" min={0} {...register('decimals')} />
              <Input label="Min" type="number" {...register('minValue')} />
              <Input
                label="Max"
                type="number"
                error={errors.maxValue?.message}
                {...register('maxValue')}
              />
            </div>
          </fieldset>
        )}

        {/* Dropdown-opties */}
        {showDropdownOpts && (
          <fieldset className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Keuzeopties</legend>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Waarde + label per optie</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDropdownOptions((o) => [...o, { value: '', label: '' }])}
              >
                + Optie
              </Button>
            </div>
            {dropdownOptions.length === 0 && (
              <p className="text-sm text-gray-500">Nog geen opties.</p>
            )}
            <div className="space-y-2">
              {dropdownOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder="waarde"
                    value={opt.value}
                    onChange={(e) =>
                      setDropdownOptions((arr) =>
                        arr.map((v, i) => (i === idx ? { ...v, value: e.target.value } : v)),
                      )
                    }
                  />
                  <Input
                    placeholder="label"
                    value={opt.label}
                    onChange={(e) =>
                      setDropdownOptions((arr) =>
                        arr.map((v, i) => (i === idx ? { ...v, label: e.target.value } : v)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDropdownOptions((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    Verwijder
                  </Button>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {/* Berekend veld */}
        {showCalculated && (
          <fieldset className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Berekening</legend>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Formule</label>
              <textarea
                {...register('formula')}
                rows={2}
                placeholder="bijv. spanning / weerstand"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Afhankelijke velden (codes in deze sectie)
              </span>
              {siblingFieldCodes.length === 0 ? (
                <p className="text-sm text-gray-500">Geen andere velden in deze sectie.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {siblingFieldCodes.map((code) => {
                    const checked = formulaDeps.includes(code);
                    return (
                      <label
                        key={code}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                          checked
                            ? 'border-primary-300 bg-primary-50 text-primary-700'
                            : 'border-gray-200 bg-white text-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={checked}
                          onChange={(e) =>
                            setFormulaDeps((deps) =>
                              e.target.checked
                                ? [...deps, code]
                                : deps.filter((d) => d !== code),
                            )
                          }
                        />
                        <code>{code}</code>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </fieldset>
        )}

        {/* Pass/fail */}
        {showPassFail && (
          <fieldset className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Pass/fail-beoordeling</legend>
            <Checkbox label="Pass/fail inschakelen" {...register('passFailEnabled')} />
            {passFailEnabled && (
              <>
                <Select
                  label="Operator"
                  options={OPERATOR_OPTIONS}
                  {...register('passFailOperator')}
                />
                {isRangeOp ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Min (pass)" type="number" {...register('passFailMinValue')} />
                    <Input
                      label="Max (pass)"
                      type="number"
                      error={errors.passFailMaxValue?.message}
                      {...register('passFailMaxValue')}
                    />
                  </div>
                ) : isInOp ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Toegestane waarden</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPassFailValues((v) => [...v, ''])}
                      >
                        + Waarde
                      </Button>
                    </div>
                    {passFailValues.length === 0 && (
                      <p className="text-sm text-gray-500">Nog geen waarden.</p>
                    )}
                    <div className="space-y-2">
                      {passFailValues.map((val, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            placeholder={`Waarde ${idx + 1}`}
                            value={val}
                            onChange={(e) =>
                              setPassFailValues((arr) =>
                                arr.map((v, i) => (i === idx ? e.target.value : v)),
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPassFailValues((arr) => arr.filter((_, i) => i !== idx))
                            }
                          >
                            Verwijder
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Input label="Drempelwaarde (pass)" type="number" {...register('passFailValue')} />
                )}
                <Input
                  label="Foutmelding bij fail"
                  placeholder="Toelichting bij afkeur"
                  error={errors.passFailFailMessage?.message}
                  {...register('passFailFailMessage')}
                />
              </>
            )}
          </fieldset>
        )}

        {/* Auto-constatering */}
        <fieldset className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <legend className="px-1 text-sm font-medium text-gray-700">Auto-constatering</legend>
          <Checkbox label="Automatisch constatering aanmaken bij fail" {...register('autoFindingEnabled')} />
          {autoFindingEnabled && (
            <>
              <Select
                label="Constatering-sjabloon"
                placeholder="Kies een sjabloon"
                options={findingTemplateOptions}
                {...register('autoFindingTemplateId')}
              />
              <QueryErrorNotice
                error={findingTemplatesError}
                label="Constatering-sjablonen"
                onRetry={refetchFindingTemplates}
              />
            </>
          )}
        </fieldset>

        {/* Herhalende-sectie opties */}
        {section.isRepeating && (
          <fieldset className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Herhalende sectie</legend>
            <Checkbox label="Waarde kopiëren naar nieuwe rij" {...register('copyValueOnNewRow')} />
            <Checkbox label="Bulk-bewerken toestaan" {...register('allowBulkEdit')} />
          </fieldset>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-3">
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
