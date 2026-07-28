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

/** Sessie-deel van de GET /client/repair/session-view (zonder inspectionPlanId/createdAt). */
export interface RepairSessionInfo {
  id: string;
  accessType: RepairAccessType;
  status: RepairSessionStatus;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  generatedDocumentId: string | null;
  expiresAt: string;
  completedAt: string | null;
}

/** Inspecteur-contact — server-side geresolved volgens ContactDisplayMode. */
export interface RepairInspector {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
}

export interface RepairPlanInfo {
  id: string;
  projectName: string;
  referenceNumber: string | null;
  addressStreet: string | null;
  addressHouseNumber: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  plannedDate: string | null;
  inspector: RepairInspector | null;
}

/** Samenvattingskaart per classificatie-groep (label + kleur van de ClassificationOption). */
export interface RepairSummaryGroup {
  code: string;
  label: string;
  color: string;
  isCritical: boolean;
  openCount: number;
  resolvedCount: number;
}

export interface RepairClassification {
  code: string;
  name: string;
  color: string;
  isCritical: boolean;
}

export interface RepairPhotoRef {
  id: string;
  url: string;
}

/**
 * Herstel-info op een herstelde constatering: werkzaamheden + foto's + datum —
 * NOOIT wie de hersteller is (PRD §14.3 besluit 4). `isMine` markeert de eigen
 * melding uit deze sessie ("Door u gemeld").
 */
export interface RepairInfo {
  resolutionId: string;
  description: string | null;
  reportedAt: string;
  photos: RepairPhotoRef[];
  isMine: boolean;
}

/** Eigen CONFLICT-concept van deze sessie (verloren race — invoer bewaard). */
export interface RepairConflictInfo {
  resolutionId: string;
  description: string | null;
  reportedAt: string;
  photos: RepairPhotoRef[];
}

export interface RepairFindingView {
  id: string;
  /** Deterministisch volgnummer binnen het plan (zelfde nummering als de verklaring). */
  seq: number;
  shortDescription: string;
  longDescription: string | null;
  locationDescription: string | null;
  normReference: string | null;
  recommendation: string | null;
  statusCode: string;
  isCritical: boolean;
  classification: RepairClassification;
  photos: RepairPhotoRef[];
  repair: RepairInfo | null;
  myConflict: RepairConflictInfo | null;
}

/** GET /client/repair/session — het volledige herstel-overzicht van de sessie. */
export interface RepairSessionView {
  session: RepairSessionInfo;
  plan: RepairPlanInfo;
  summary: RepairSummaryGroup[];
  findings: RepairFindingView[];
}

/** POST /client/repair/lookup en POST /client/repair/sessions: view + sessietoken. */
export interface RepairSessionStartResult extends RepairSessionView {
  token: string;
  expiresAt: string;
}

/** POST /client/repair/findings/:id/resolve. */
export interface RepairClaimResult {
  resolution: {
    id: string;
    findingId: string;
    statusCode: string;
    description: string | null;
    reportedAt: string;
  };
}

export interface RepairResolutionPhoto {
  id: string;
  uploadedAt: string;
  url: string;
}

/** POST /client/repair/complete — concept-herstelverklaring. */
export interface RepairCompleteResult {
  documentId: string;
  htmlPreview: string;
}

/** POST /client/repair/sign. */
export interface RepairSignResult {
  documentId: string;
  status: 'SIGNED';
  signedAt: string;
  pdfDownloadUrl: string;
}
