import { useState } from 'react';
import { Button, Spinner, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useMeetmiddelen } from '../hooks/use-meetmiddelen';
import {
  useMyDefaultInstruments,
  useSetMyDefaultInstruments,
} from '../hooks/use-instrument-defaults';
import { InstrumentMultiSelect } from './instrument-multi-select';

const sortedKey = (ids: string[]) => [...ids].sort().join(',');

/** Niveau-1 voorkeur: de vaste set meetmiddelen van de ingelogde inspecteur. */
export function MyDefaultInstrumentsSection() {
  const { showToast } = useToast();
  const { data: list, isLoading: listLoading } = useMeetmiddelen({ limit: 200 });
  const { data: current, isLoading: currentLoading } = useMyDefaultInstruments();
  const setMutation = useSetMyDefaultInstruments();

  const [draft, setDraft] = useState<string[] | null>(null);
  const value = draft ?? current ?? [];
  const isDirty = draft !== null && sortedKey(draft) !== sortedKey(current ?? []);

  const handleSave = async () => {
    try {
      await setMutation.mutateAsync(value);
      setDraft(null);
      showToast('Standaard-meetmiddelen opgeslagen', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  if (listLoading || currentLoading) {
    return <div className="flex justify-center py-6"><Spinner /></div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Deze meetmiddelen worden voorinvuld op nieuwe meetstaten (tenzij de inspectie een eigen
        set heeft).
      </p>
      <InstrumentMultiSelect
        instruments={list?.data ?? []}
        selectedIds={value}
        onChange={setDraft}
        disabled={setMutation.isPending}
      />
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!isDirty} isLoading={setMutation.isPending}>
          Opslaan
        </Button>
      </div>
    </div>
  );
}
