import { useMemo, useState } from 'react';
import { Button, SortableList, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useContactLocations } from '@/pages/contacts/hooks/use-locations';
import { useContactPersons } from '@/pages/contacts/hooks/use-contact-persons';
import type { ProjectPhase } from '@/types';
import { useCreatePhase, useReorderPhases } from '../hooks/use-project-phases';
import { PhaseCard, type SelectOption } from './project-phase-card';
import { CreatePhaseModal } from './create-phase-modal';

interface LinkedEntity {
  id: string;
  projectPhaseId?: string | null;
  [key: string]: unknown;
}

export function ProjectPhasesTab({
  projectId,
  contactId,
  phases,
  canWrite,
  projectQuotes,
  projectPlanning,
}: {
  projectId: string;
  contactId: string | undefined;
  phases: ProjectPhase[];
  canWrite: boolean;
  projectQuotes: LinkedEntity[];
  projectPlanning: LinkedEntity[];
}) {
  const { showToast } = useToast();
  const createMutation = useCreatePhase(projectId);
  const reorderMutation = useReorderPhases(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Optimistische reorder-override: id-volgorde die de server-volgorde tijdelijk vervangt.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  // Dropdown-data voor de fase-context (locatie + contactpersoon van het projectcontact).
  const { data: contactLocations } = useContactLocations(contactId ?? '');
  const { data: contactPersonsPage } = useContactPersons(
    contactId ? { contactId, limit: 200 } : {},
  );

  const locationOptions: SelectOption[] = useMemo(
    () => (contactLocations ?? []).map((l) => ({ value: l.id, label: l.name })),
    [contactLocations],
  );
  const contactPersonOptions: SelectOption[] = useMemo(
    () =>
      (contactPersonsPage?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.firstName} ${p.lastName}`.trim(),
      })),
    [contactPersonsPage],
  );

  // Toegepaste volgorde: optimistische override indien aanwezig, anders de server-volgorde.
  const orderedPhases = useMemo(() => {
    if (!localOrder) return phases;
    const byId = new Map(phases.map((p) => [p.id, p]));
    const mapped = localOrder
      .map((id) => byId.get(id))
      .filter((p): p is ProjectPhase => !!p);
    // Val terug op server-volgorde als de sets niet overeenkomen (bv. na refetch).
    return mapped.length === phases.length ? mapped : phases;
  }, [phases, localOrder]);

  const handleReorder = async (orderedIds: string[]) => {
    setLocalOrder(orderedIds);
    try {
      await reorderMutation.mutateAsync(orderedIds);
      setLocalOrder(null); // server-data neemt over
    } catch (err) {
      setLocalOrder(null); // rollback naar server-volgorde
}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {phases.length === 0
            ? 'Nog geen fasen. Voeg een fase toe om het project op te delen.'
            : `${phases.length} ${phases.length === 1 ? 'fase' : 'fasen'}`}
        </p>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>+ Fase</Button>
        )}
      </div>

      <SortableList
        items={orderedPhases}
        getId={(p) => p.id}
        disabled={!canWrite || orderedPhases.length < 2}
        onReorder={handleReorder}
        renderItem={(phase, { dragHandleProps }) => {
          const index = orderedPhases.findIndex((p) => p.id === phase.id);
          return (
            <PhaseCard
              projectId={projectId}
              phase={phase}
              index={index}
              canWrite={canWrite}
              expanded={expandedId === phase.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === phase.id ? null : phase.id))
              }
              dragHandleProps={dragHandleProps}
              locationOptions={locationOptions}
              contactPersonOptions={contactPersonOptions}
              projectQuotes={projectQuotes}
              projectPlanning={projectPlanning}
            />
          );
        }}
      />

      {createOpen && (
        <CreatePhaseModal
          canWrite={canWrite}
          locationOptions={locationOptions}
          contactPersonOptions={contactPersonOptions}
          isCreating={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onCreate={async (data) => {
            try {
              await createMutation.mutateAsync(data);
              showToast('Fase toegevoegd', 'success');
              setCreateOpen(false);
            } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
          }}
        />
      )}
    </div>
  );
}
