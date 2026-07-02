import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Select, StatusBadge } from '@/components/ui';
import { PHASE_STATUS } from '@/lib/status';
import { useProjectPhases } from '@/pages/projects/hooks/use-project-phases';
import type { ProjectPhaseRef } from '@/types';

interface PhaseSelectProps {
  /** Project waarvan de fasen geladen worden; leeg/null → veld disabled. */
  projectId: string | null | undefined;
  /** Huidige gekoppelde fase (projectPhaseId) of null/leeg = geen fase. */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Herbruikbare fase-select (PRD-12 §12.7.2). Laadt de fasen van het gekozen
 * project en toont "Fase {n} — {naam}" met status-suffix. Zonder gekozen
 * project is het veld disabled met een hint. De lege optie ontkoppelt de fase.
 */
export function PhaseSelect({
  projectId,
  value,
  onChange,
  label = 'Fase',
  disabled = false,
}: PhaseSelectProps) {
  const { data: phases, isLoading } = useProjectPhases(projectId ?? '');

  const options = useMemo(() => {
    const base = [{ value: '', label: 'Geen fase' }];
    (phases ?? []).forEach((phase, index) => {
      const statusLabel = PHASE_STATUS[phase.status]?.label ?? phase.status;
      base.push({
        value: phase.id,
        label: `Fase ${index + 1} — ${phase.name} (${statusLabel})`,
      });
    });
    return base;
  }, [phases]);

  const noProject = !projectId;

  return (
    <div>
      <Select
        label={label}
        options={options}
        value={value ?? ''}
        disabled={disabled || noProject || isLoading}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
      {noProject && (
        <p className="mt-1 text-xs text-gray-500">
          Kies eerst een project om een fase te kunnen selecteren.
        </p>
      )}
    </div>
  );
}

/** Weergave "Fase {n} — {naam}" op basis van sortOrder (1-based). */
export function phaseDisplayLabel(phase: Pick<ProjectPhaseRef, 'name' | 'sortOrder'>): string {
  return `Fase ${phase.sortOrder + 1} — ${phase.name}`;
}

/**
 * Lees-modus veld voor een gekoppelde fase (PRD-12 §12.7.2): toont de fase met
 * status-badge en linkt terug naar het project op de tab Fasen. Zonder fase → '—'.
 */
export function PhaseInfoField({
  phase,
  projectId,
  label = 'Fase',
}: {
  phase: ProjectPhaseRef | null | undefined;
  projectId: string | null | undefined;
  label?: string;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-900">
        {phase ? (
          <>
            {projectId ? (
              <Link
                to={`/projects/${projectId}?tab=fasen`}
                className="text-primary-600 hover:text-primary-800 hover:underline"
              >
                {phaseDisplayLabel(phase)}
              </Link>
            ) : (
              <span>{phaseDisplayLabel(phase)}</span>
            )}
            <StatusBadge status={phase.status} map={PHASE_STATUS} />
          </>
        ) : (
          '—'
        )}
      </dd>
    </div>
  );
}
