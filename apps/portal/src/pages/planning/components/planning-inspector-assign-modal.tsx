import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Spinner, useToast } from '@/components/ui';
import { Role } from '@/types';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { useResolvedAvailability } from '@/pages/availability/hooks/use-availability';
import { dateKeyFromISO } from '@/components/availability/format-availability';
import { useAssignInspectors } from '../hooks/use-planning';
import { useAvailabilityOverride } from '../hooks/use-availability-override';

/**
 * Inspecteurs toewijzen aan een (enkeldaagse) planregel (PRD-12 §12.9).
 *
 * Per inspecteur een "Niet beschikbaar"-badge wanneer de resolved beschikbaarheid
 * voor de geplande datum negatief is (freelancers zonder beschikbaarheid dus
 * standaard). De badges komen uit één batched `useResolvedAvailability`-call voor
 * álle getoonde inspecteurs op die datum — geen N losse checks. Bij het opslaan
 * vangt de override-flow een 409-met-warnings af en vraagt om bevestiging.
 */
export function InspectorAssignModal({
  planningItemId,
  isOpen,
  onClose,
  scheduledDate,
  currentInspectorIds,
  currentPrimaryId,
}: {
  planningItemId: string;
  isOpen: boolean;
  onClose: () => void;
  scheduledDate: string | null;
  currentInspectorIds: string[];
  currentPrimaryId: string | null;
}) {
  const { showToast } = useToast();
  const assign = useAssignInspectors(planningItemId);
  const withAvailabilityOverride = useAvailabilityOverride();

  const { data: inspectors, isLoading } = useSelectableUsers(Role.INSPECTEUR, { enabled: isOpen });

  const [selectedIds, setSelectedIds] = useState<string[]>(currentInspectorIds);
  const [primaryId, setPrimaryId] = useState<string | null>(currentPrimaryId);

  // Reset de selectie telkens wanneer de modal (opnieuw) opent.
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(currentInspectorIds);
      setPrimaryId(currentPrimaryId ?? currentInspectorIds[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const dateKey = scheduledDate ? dateKeyFromISO(scheduledDate) : '';
  const allInspectorIds = useMemo(() => (inspectors ?? []).map((u) => u.id), [inspectors]);

  // Batched beschikbaarheid voor álle getoonde inspecteurs op de planningsdatum.
  const { data: resolved } = useResolvedAvailability(dateKey, dateKey, allInspectorIds, {
    enabled: isOpen && !!dateKey && allInspectorIds.length > 0,
  });

  const unavailableIds = useMemo(() => {
    const set = new Set<string>();
    for (const day of resolved ?? []) {
      if (day.date === dateKey && !day.isAvailable) set.add(day.userId);
    }
    return set;
  }, [resolved, dateKey]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (primaryId === id) setPrimaryId(next[0] ?? null);
        return next;
      }
      if (prev.length === 0) setPrimaryId(id);
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    if (selectedIds.length === 0) {
      showToast('Selecteer minimaal één inspecteur', 'error');
      return;
    }
    const primaryInspectorId = primaryId && selectedIds.includes(primaryId) ? primaryId : selectedIds[0];
    try {
      const { ok } = await withAvailabilityOverride((override) =>
        assign.mutateAsync({
          inspectorIds: selectedIds,
          primaryInspectorId,
          ...(override ? { overrideAvailabilityWarnings: true } : {}),
        }),
      );
      if (!ok) return;
      showToast('Inspecteurs toegewezen', 'success');
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inspecteurs toewijzen">
      <div className="space-y-4">
        {scheduledDate ? (
          <p className="text-sm text-gray-500">
            De beschikbaarheid wordt getoetst op de geplande datum.
          </p>
        ) : (
          <p className="text-sm text-amber-600">
            Deze planregel heeft nog geen datum — de beschikbaarheid wordt niet getoetst.
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (inspectors ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">Geen inspecteurs gevonden.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {(inspectors ?? []).map((u) => {
              const checked = selectedIds.includes(u.id);
              const unavailable = unavailableIds.has(u.id);
              return (
                <li
                  key={u.id}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-50"
                >
                  <label className="flex flex-1 items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(u.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-900">
                      {u.firstName} {u.lastName}
                    </span>
                    {unavailable && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Niet beschikbaar
                      </span>
                    )}
                  </label>
                  {checked && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="radio"
                        name="primary-inspector"
                        checked={primaryId === u.id}
                        onChange={() => setPrimaryId(u.id)}
                        className="h-3.5 w-3.5 text-blue-600"
                      />
                      Primair
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={assign.isPending || selectedIds.length === 0}>
            {assign.isPending ? 'Opslaan...' : 'Toewijzen'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
