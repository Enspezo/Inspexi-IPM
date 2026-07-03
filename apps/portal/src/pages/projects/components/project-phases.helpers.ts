import { MilestoneStatus } from '@/types';
import type { PhaseMilestoneSummaryItem } from '@/types';

// ─── Pure helpers (getest in project-phases.helpers.test.ts) ─────────────

/**
 * Verplaatst het item met `activeId` naar de positie van `overId` en geeft de
 * nieuwe id-volgorde terug. Gebruikt voor de optimistische reorder van fasen.
 * Onbekende id's of een no-op laten de volgorde ongewijzigd.
 */
export function reorderById<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
): string[] {
  const ids = items.map((i) => i.id);
  if (activeId === overId) return ids;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}

// ─── Milestone-samenvatting ──────────────────────────────────────────────

export interface MilestoneSummary {
  total: number;
  behaald: number;
  open: number;
  vervallen: number;
  /** OPEN én dueDate in het verleden ⇒ visueel "verlopen" (§12.4.6). */
  verlopen: number;
  /** Kleuraccent voor de samenvatting: rood bij verlopen, anders neutraal. */
  accent: 'red' | 'gray';
  /** Compacte weergave, bijv. "2/3 behaald, 1 verlopen". */
  label: string;
}

/** Begin van de dag (lokale tijd) — voor date-only vergelijkingen. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Vat de milestones van een fase samen: aantallen per status plus het aantal
 * "verlopen" (OPEN met een dueDate in het verleden) en een compact label.
 */
export function summarizeMilestones(
  milestones: PhaseMilestoneSummaryItem[] | undefined,
  now: Date = new Date(),
): MilestoneSummary {
  const list = milestones ?? [];
  const today = startOfDay(now);

  let behaald = 0;
  let open = 0;
  let vervallen = 0;
  let verlopen = 0;

  for (const m of list) {
    if (m.status === MilestoneStatus.BEHAALD) behaald += 1;
    else if (m.status === MilestoneStatus.VERVALLEN) vervallen += 1;
    else if (m.status === MilestoneStatus.OPEN) {
      open += 1;
      const due = new Date(m.dueDate);
      if (!Number.isNaN(due.getTime()) && startOfDay(due) < today) verlopen += 1;
    }
  }

  const total = list.length;
  const accent: 'red' | 'gray' = verlopen > 0 ? 'red' : 'gray';

  let label: string;
  if (total === 0) {
    label = 'Geen milestones';
  } else {
    label = `${behaald}/${total} behaald`;
    if (verlopen > 0) label += `, ${verlopen} verlopen`;
  }

  return { total, behaald, open, vervallen, verlopen, accent, label };
}
