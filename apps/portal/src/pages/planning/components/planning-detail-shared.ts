import { PlanningStatus } from '@/types';
import { PLANNING_STATUS, getStatusConfig } from '@/lib/status';

/** Pagina-specifiek label: CONCEPT krijgt hier een uitgebreider label dan de canonieke map. */
export function planningStatusLabel(status: string): string {
  if (status === PlanningStatus.CONCEPT) return 'Concept — wacht op acceptatie';
  return getStatusConfig(PLANNING_STATUS, status).label;
}

/** Zet ISO datetime string om naar datetime-local inputwaarde */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
