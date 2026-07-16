// Online herstel van constateringen (PRD-14). Spiegelt de response-shapes van
// apps/api/src/modules/client-repair. De sessie-specifieke view-types (overzicht,
// samenvatting per classificatie-groep) horen bij de herstel-flow-hooks.

export type RepairAccessType = 'CLIENT_USER' | 'ANONYMOUS';

export type RepairSessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED';

/** Herstelsessie: één toegangssessie tot de herstel-flow van één inspectieplan. */
export interface RepairSession {
  id: string;
  inspectionPlanId: string;
  accessType: RepairAccessType;
  status: RepairSessionStatus;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  generatedDocumentId: string | null;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
}
