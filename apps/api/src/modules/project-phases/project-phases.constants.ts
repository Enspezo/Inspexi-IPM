import { PhaseStatus } from '@prisma/client';

/**
 * Nederlandse labels voor de fasestatus, gebruikt in notificatie-teksten
 * (bijv. "Fase 'Verdieping Noord' is nu Actief"). De portal houdt zijn eigen
 * PHASE_STATUS-map aan in `lib/status.ts`; FE en BE delen geen package.
 */
export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  [PhaseStatus.NIET_GESTART]: 'Niet gestart',
  [PhaseStatus.ACTIEF]: 'Actief',
  [PhaseStatus.ON_HOLD]: 'On hold',
  [PhaseStatus.AFGEROND]: 'Afgerond',
  [PhaseStatus.GEANNULEERD]: 'Geannuleerd',
};
