import { useEffect, useState } from 'react';
import { Button, Input, Select, Checkbox, Card, Spinner, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { NumberingScheme, NumberingModel } from '@/types';
import {
  useNumberingSchemes,
  useUpdateNumberingScheme,
  type UpdateNumberingSchemeInput,
} from '../hooks/use-numbering-schemes';

const MODEL_LABELS: Record<NumberingModel, string> = {
  REQUEST: 'Aanvraag',
  QUOTE: 'Offerte',
  PROJECT: 'Project',
  PRODUCT: 'Product',
  WORK_ORDER: 'Werkbon',
  LOCATION_NODE: 'Locatie-nummering',
  ASSET_NODE: 'Asset-nummering',
};

/** Allowed placeholders per model — mirrors the backend catalogue. */
const MODEL_PLACEHOLDERS: Record<NumberingModel, string[]> = {
  REQUEST: ['jaar', 'maand', 'dag', 'postcode', 'contact'],
  QUOTE: ['jaar', 'maand', 'dag', 'postcode', 'contact'],
  PROJECT: ['jaar', 'maand', 'dag', 'postcode', 'contact'],
  PRODUCT: ['jaar', 'maand', 'dag', 'groep'],
  WORK_ORDER: ['jaar', 'maand', 'dag', 'postcode', 'huisnummer', 'contact'],
  LOCATION_NODE: ['jaar', 'maand', 'dag', 'typecode'],
  ASSET_NODE: ['jaar', 'maand', 'dag', 'typecode'],
};

const PLACEHOLDER_LABELS: Record<string, string> = {
  jaar: 'Jaar',
  maand: 'Maand',
  dag: 'Dag',
  postcode: 'Postcode',
  huisnummer: 'Huisnummer',
  contact: 'Relatie',
  groep: 'Productgroep',
  typecode: 'Type-shortcode',
};

/** Display order of the model cards. */
const MODEL_ORDER: NumberingModel[] = [
  'REQUEST', 'QUOTE', 'PROJECT', 'WORK_ORDER', 'PRODUCT', 'LOCATION_NODE', 'ASSET_NODE',
];

const MODE_OPTIONS = [
  { value: 'SEQUENTIAL', label: 'Oplopend (teller)' },
  { value: 'RANDOM', label: 'Willekeurig' },
];

const RESET_OPTIONS = [
  { value: 'CONTINUOUS', label: 'Doorlopend' },
  { value: 'PER_YEAR', label: 'Per jaar' },
  { value: 'PER_MONTH', label: 'Per maand' },
];

/** Client-side preview of a number — matches the server compose logic closely enough for a live hint. */
function composePreview(scheme: {
  prefix: string;
  suffix: string;
  mode: string;
  start: number;
  digits: number;
}): string {
  const now = new Date();
  const values: Record<string, string> = {
    jaar: String(now.getFullYear()),
    maand: String(now.getMonth() + 1).padStart(2, '0'),
    dag: String(now.getDate()).padStart(2, '0'),
    postcode: '1234AB',
    contact: 'VOORBEELDBV',
    groep: 'ALGEMEEN',
  };
  const digits = Math.max(1, Math.min(12, scheme.digits || 1));
  const resolve = (t: string) =>
    (t || '').replace(/\[(\w+)\]/g, (_m, k: string) =>
      k.toLowerCase() in values ? values[k.toLowerCase()] : '',
    );
  const numeric =
    scheme.mode === 'RANDOM'
      ? Math.floor(Math.random() * Math.pow(10, digits))
      : Math.max(0, scheme.start || 0);
  return `${resolve(scheme.prefix)}${String(numeric).padStart(digits, '0')}${resolve(scheme.suffix)}`;
}

type FormState = Required<
  Pick<
    NumberingScheme,
    'prefix' | 'suffix' | 'mode' | 'start' | 'interval' | 'digits' | 'resetPolicy' | 'allowManualEntry'
  >
>;

function toForm(s: NumberingScheme): FormState {
  return {
    prefix: s.prefix,
    suffix: s.suffix,
    mode: s.mode,
    start: s.start,
    interval: s.interval,
    digits: s.digits,
    resetPolicy: s.resetPolicy,
    allowManualEntry: s.allowManualEntry,
  };
}

function NumberingSchemeCard({ scheme }: { scheme: NumberingScheme }) {
  const { showToast } = useToast();
  const updateMutation = useUpdateNumberingScheme();
  const [form, setForm] = useState<FormState>(() => toForm(scheme));

  // Re-sync when the server data changes (e.g. after a save invalidates the list).
  useEffect(() => {
    setForm(toForm(scheme));
  }, [scheme]);

  const dirty = (Object.keys(form) as (keyof FormState)[]).some(
    (k) => form[k] !== toForm(scheme)[k],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const insertPlaceholder = (token: string) =>
    set('prefix', `${form.prefix}[${token}]`);

  const handleSave = async () => {
    const data: UpdateNumberingSchemeInput = { ...form };
    try {
      await updateMutation.mutateAsync({ model: scheme.model, data });
      showToast('Nummering opgeslagen', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-gray-900">
              {MODEL_LABELS[scheme.model]}
            </h4>
            <p className="mt-0.5 text-sm text-gray-500">
              Voorbeeld:{' '}
              <span className="font-mono font-medium text-gray-900">
                {composePreview(form)}
              </span>
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!dirty}
            isLoading={updateMutation.isPending}
          >
            Opslaan
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Voorvoegsel (prefix)"
            value={form.prefix}
            onChange={(e) => set('prefix', e.target.value)}
            placeholder="OFF-[jaar]-"
          />
          <Input
            label="Achtervoegsel (suffix)"
            value={form.suffix}
            onChange={(e) => set('suffix', e.target.value)}
            placeholder=""
          />
        </div>

        <div>
          <span className="text-xs font-medium text-gray-500">Placeholders (klik om toe te voegen):</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MODEL_PLACEHOLDERS[scheme.model].map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertPlaceholder(token)}
                className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-700 hover:border-primary-400 hover:bg-primary-50"
                title={PLACEHOLDER_LABELS[token]}
              >
                [{token}]
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Select
            label="Modus"
            options={MODE_OPTIONS}
            value={form.mode}
            onChange={(e) => set('mode', e.target.value as FormState['mode'])}
          />
          <Input
            label="Aantal cijfers"
            type="number"
            min={1}
            max={12}
            value={form.digits}
            onChange={(e) => set('digits', Number(e.target.value))}
          />
          {form.mode === 'SEQUENTIAL' ? (
            <>
              <Input
                label="Startwaarde"
                type="number"
                min={0}
                value={form.start}
                onChange={(e) => set('start', Number(e.target.value))}
              />
              <Input
                label="Interval"
                type="number"
                min={1}
                value={form.interval}
                onChange={(e) => set('interval', Number(e.target.value))}
              />
            </>
          ) : (
            <div className="col-span-2 self-end text-xs text-gray-500">
              Willekeurige nummers binnen het aantal cijfers; bij een botsing wordt
              automatisch een nieuw nummer geprobeerd. Kies voldoende cijfers.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {form.mode === 'SEQUENTIAL' && (
            <Select
              label="Reset-beleid"
              options={RESET_OPTIONS}
              value={form.resetPolicy}
              onChange={(e) => set('resetPolicy', e.target.value as FormState['resetPolicy'])}
            />
          )}
          <div className="flex items-end">
            <Checkbox
              label="Handmatig nummer toestaan per record"
              checked={form.allowManualEntry}
              onChange={(e) => set('allowManualEntry', e.target.checked)}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function NumberingSchemesManagement() {
  const { data: schemes, isLoading } = useNumberingSchemes();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const ordered = [...(schemes ?? [])].sort(
    (a, b) => MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model),
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Nummering</h3>
        <p className="mt-1 text-sm text-gray-500">
          Stel per type in hoe het nummer wordt opgebouwd. Het nummer is altijd uniek
          binnen uw organisatie.
        </p>
      </div>

      <div className="space-y-4">
        {ordered.map((scheme) => (
          <NumberingSchemeCard key={scheme.id} scheme={scheme} />
        ))}
      </div>
    </div>
  );
}
