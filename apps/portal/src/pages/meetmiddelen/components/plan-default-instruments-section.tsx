import { useState } from 'react';
import { Button, Spinner, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useMeetmiddelen } from '../hooks/use-meetmiddelen';
import {
  usePlanDefaultInstruments,
  useSetPlanDefaultInstruments,
} from '../hooks/use-instrument-defaults';
import { InstrumentMultiSelect } from './instrument-multi-select';

const sortedKey = (ids: string[]) => [...ids].sort().join(',');

interface PlanDefaultInstrumentsSectionProps {
  planId: string;
  canEdit: boolean;
}

/** Niveau-2 voorkeur: override-set meetmiddelen voor één inspectie. */
export function PlanDefaultInstrumentsSection({ planId, canEdit }: PlanDefaultInstrumentsSectionProps) {
  const { showToast } = useToast();
  const { data: list, isLoading: listLoading } = useMeetmiddelen({ limit: 200 });
  const { data: current, isLoading: currentLoading } = usePlanDefaultInstruments(planId);
  const setMutation = useSetPlanDefaultInstruments(planId);

  const [draft, setDraft] = useState<string[] | null>(null);
  const value = draft ?? current ?? [];
  const isDirty = draft !== null && sortedKey(draft) !== sortedKey(current ?? []);

  const handleSave = async () => {
    try {
      await setMutation.mutateAsync(value);
      setDraft(null);
      showToast('Standaard-meetmiddelen voor deze inspectie opgeslagen', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  if (listLoading || currentLoading) {
    return <div className="flex justify-center py-6"><Spinner /></div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Voorinvulling van de gebruikte meetmiddelen op meetstaten binnen deze inspectie. Heeft
        voorrang op de persoonlijke standaard van de inspecteur.
      </p>
      <InstrumentMultiSelect
        instruments={list?.data ?? []}
        selectedIds={value}
        onChange={canEdit ? setDraft : () => {}}
        disabled={!canEdit || setMutation.isPending}
      />
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!isDirty} isLoading={setMutation.isPending}>
            Opslaan
          </Button>
        </div>
      )}
    </div>
  );
}
