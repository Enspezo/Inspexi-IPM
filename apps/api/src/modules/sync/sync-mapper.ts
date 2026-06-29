// v3: de PWA stuurt al Beheer-veldnamen, dus GEEN rename meer — wel een strikte
// WHITELIST per entiteit (nooit blind ...data in Prisma spreaden) + datum-coercie.
// orgId wordt NOOIT door de client gezet: de service injecteert die uit de eigen rij.
//
// v3-wijzigingen t.o.v. v2 (unified AssetNode tree, breaking):
//   - `assets` → `assetNodes`: één boom (LOCATION + ASSET) i.p.v. losse assets/locations.
//     org { from: 'self' } (AssetNode heeft eigen orgId); GEEN inspectionPlanId/locationId
//     meer op de node (boom hangt aan parentId/rootLocationId). path/depth = trigger-onderhouden,
//     niet in het contract.
//   - findings: org { from: 'self' }; assetId → assetNodeId + verplichte inspectionPlanId.
//   - inspectionPlans: locationId (hoofdlocatie/boom-wortel) toegevoegd.
//   - vier uitvoerings-entiteiten toegevoegd: visualInspections, measurementRecords,
//     measurementSheetRecords, standaloneMeasurements (alle org { from: 'self' }).
//     StandaloneMeasurementValue reist genest mee in de standaloneMeasurement-payload.

/** Het contract-versienummer; bump bij elke breaking wijziging aan de wire-vorm. */
export const SYNC_CONTRACT_VERSION = 3;

export type SyncEntityKey =
  | 'inspectionPlans'
  | 'assetNodes'
  | 'findings'
  | 'visualInspections'
  | 'measurementRecords'
  | 'measurementSheetRecords'
  | 'standaloneMeasurements';

/** Prisma-modelnamen die de sync aanraakt (eigen entiteiten + check-targets). */
export type SyncModelName =
  | 'inspectionPlan'
  | 'assetNode'
  | 'finding'
  | 'visualInspection'
  | 'measurementRecord'
  | 'measurementSheetRecord'
  | 'standaloneMeasurement';

/** Modellen waartegen we een same-org FK-check kunnen draaien (cross-tenant guard). */
export type FkCheckModel = 'assetNode' | 'inspectionPlan' | 'location';

/**
 * Inkomend client-record (wire) — Beheer-veldnamen. Alleen de sleutels die de service
 * expliciet uitleest zijn benoemd; de overige whitelisted velden komen via de
 * index-signatuur binnen en worden door {@link toDbData} gefilterd.
 */
export interface SyncRecordData {
  id?: string;
  syncedAt?: string;
  createdBy?: string;
  [field: string]: unknown;
}

/** Geneste kind-records die in dezelfde wire-record meereizen (replace-on-write). */
interface NestedChildConfig {
  /** Sleutel in het wire-record (PWA-payload). */
  wireField: string;
  /** Prisma-relatienaam op het ouder-model. */
  relation: string;
  /** Toegestane scalars op het kind. */
  allowed: string[];
  /** Velden die als Date geparsed worden. */
  dateFields: string[];
}

interface EntityConfig {
  /** Prisma-modelnaam (delegate-key op PrismaService). */
  model: SyncModelName;
  /** Singular entityType voor conflicts/errors/resolve in de response. */
  singular: SyncModelName;
  /** Heeft soft-delete via deletedAt (tombstone). */
  softDelete: true;
  /** Velden die de client mag zetten (scalars). orgId/id staan hier NIET in. */
  allowed: string[];
  /** Velden die als Date geparsed moeten worden. */
  dateFields: string[];
  /**
   * Waar orgId vandaan komt. In v3 is dat altijd `self` (elke entiteit heeft een eigen
   * orgId-kolom); de `parent`-variant blijft getypeerd voor toekomstig gebruik.
   */
  org: { from: 'self' } | { from: 'parent'; fkField: string; parentModel: 'inspectionPlan' | 'assetNode' };
  /** Of de service createdBy moet injecteren (modellen zonder createdBy-kolom: false). */
  injectCreatedBy: boolean;
  /** FK-velden die — indien aanwezig — tot dezelfde org moeten horen (cross-tenant). */
  fkChecks?: Array<{ field: string; model: FkCheckModel; label: string }>;
  /** Optioneel: kind-records die genest meereizen. */
  nestedChild?: NestedChildConfig;
}

const PLAN_DATES = ['plannedDate', 'deadline', 'startedAt', 'submittedAt', 'reviewedAt', 'approvedAt', 'completedAt'];
const FINDING_DATES = ['resolvedAt'];
const VI_DATES = ['startedAt', 'completedAt'];
const MR_DATES = ['startedAt', 'completedAt', 'calibrationDate'];
const MSR_DATES = ['completedAt'];

export const SYNC_ENTITIES: Record<SyncEntityKey, EntityConfig> = {
  inspectionPlans: {
    model: 'inspectionPlan',
    singular: 'inspectionPlan',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: true,
    dateFields: PLAN_DATES,
    allowed: [
      'contactId', 'projectId', 'locationId', 'inspectionTemplateId', 'projectName', 'description',
      'referenceNumber', 'normTypeCode', 'inspectionTypeCode', 'addressStreet',
      'addressHouseNumber', 'addressPostalCode', 'addressCity', 'gpsLatitude', 'gpsLongitude',
      'plannedDate', 'plannedDurationHours', 'deadline', 'assignedTo', 'reviewerId',
      'installationResponsibleId', 'statusCode', 'notes', 'internalNotes', 'metadata',
      ...PLAN_DATES, 'createdBy', 'deviceId',
    ],
  },
  assetNodes: {
    model: 'assetNode',
    singular: 'assetNode',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: true,
    dateFields: [],
    // path/depth bewust NIET — die worden door de DB-trigger onderhouden.
    allowed: [
      'parentId', 'rootLocationId', 'nodeType', 'typeCode', 'name', 'identifier',
      'description', 'technicalData', 'statusCode', 'notes', 'sortOrder',
      'createdBy', 'deviceId',
    ],
    fkChecks: [
      { field: 'parentId', model: 'assetNode', label: 'Bovenliggende node' },
      { field: 'rootLocationId', model: 'location', label: 'Hoofdlocatie' },
    ],
  },
  findings: {
    model: 'finding',
    singular: 'finding',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: true,
    dateFields: FINDING_DATES,
    allowed: [
      'assetNodeId', 'inspectionPlanId', 'visualInspectionId', 'measurementRecordId', 'findingTemplateId',
      'inspectionType', 'shortDescription', 'longDescription', 'classificationValues',
      'locationDescription', 'recommendation', 'recommendationCustom', 'normReference',
      'checklistItemId', 'statusCode', 'resolvedAt', 'resolvedBy', 'resolutionNotes',
      ...FINDING_DATES, 'createdBy', 'deviceId',
    ],
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
    ],
  },
  visualInspections: {
    model: 'visualInspection',
    singular: 'visualInspection',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: false, // VisualInspection heeft geen createdBy-kolom
    dateFields: VI_DATES,
    allowed: [
      'assetNodeId', 'inspectionPlanId', 'status', 'checklistResults',
      'startedAt', 'completedAt', 'inspectorId', 'deviceId',
    ],
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
    ],
  },
  measurementRecords: {
    model: 'measurementRecord',
    singular: 'measurementRecord',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: false, // MeasurementRecord heeft geen createdBy-kolom
    dateFields: MR_DATES,
    allowed: [
      'assetNodeId', 'inspectionPlanId', 'status', 'measurements',
      'instrumentType', 'instrumentSerial', 'calibrationDate',
      'startedAt', 'completedAt', 'inspectorId', 'deviceId',
    ],
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
    ],
  },
  measurementSheetRecords: {
    model: 'measurementSheetRecord',
    singular: 'measurementSheetRecord',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: true, // createdBy is verplicht op MeasurementSheetRecord
    dateFields: MSR_DATES,
    allowed: [
      'templateId', 'assetNodeId', 'inspectionPlanId', 'templateVersion', 'templateSnapshot',
      'status', 'data', 'usedInstrumentIds', 'finalCheckExecuted', 'finalCheckPassed',
      'finalCheckResults', 'completedAt', 'createdBy', 'deviceId',
    ],
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
    ],
  },
  standaloneMeasurements: {
    model: 'standaloneMeasurement',
    singular: 'standaloneMeasurement',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: true,
    dateFields: [],
    // StandaloneMeasurement heeft geen assetNodeId; het hangt aan locationNodeId (LOCATION-node)
    // met een optionele linkedAssetNodeId, plus de verplichte inspectionPlanId.
    allowed: [
      'inspectionPlanId', 'locationNodeId', 'measurementType', 'description',
      'linkedAssetNodeId', 'sampleId', 'createdBy', 'deviceId',
    ],
    fkChecks: [
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
      { field: 'locationNodeId', model: 'assetNode', label: 'Locatie-node' },
      { field: 'linkedAssetNodeId', model: 'assetNode', label: 'Gekoppelde asset-node' },
    ],
    // Waarde-rijen zijn waarde-objecten (geen eigen orgId/syncedAt/deletedAt) → genest,
    // replace-on-write.
    nestedChild: {
      wireField: 'values',
      relation: 'values',
      allowed: ['fieldName', 'fieldType', 'value', 'unit', 'passFailCode'],
      dateFields: [],
    },
  },
};

/** Coerce één veld: datum-strings → Date, rest ongewijzigd. */
function coerce(field: string, value: unknown, dateFields: string[]): unknown {
  return dateFields.includes(field) && typeof value === 'string' ? new Date(value) : value;
}

/** Whitelist + datum-coercie. Onbekende velden (incl. orgId/id/_pendingSync) worden genegeerd. */
export function toDbData(key: SyncEntityKey, data: Record<string, unknown>): Record<string, unknown> {
  const cfg = SYNC_ENTITIES[key];
  const out: Record<string, unknown> = {};
  for (const field of cfg.allowed) {
    if (data[field] === undefined) continue;
    out[field] = coerce(field, data[field], cfg.dateFields);
  }
  return out;
}

/**
 * Bouwt de geneste kind-rijen uit een wire-record (whitelist + datum-coercie per rij).
 * Geeft `null` als het wire-veld ontbreekt (→ laat bestaande kinderen ongemoeid bij update);
 * een lege array betekent "vervang door niets".
 */
export function toChildRows(
  child: NestedChildConfig,
  data: Record<string, unknown>,
): Array<Record<string, unknown>> | null {
  const raw = data[child.wireField];
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const field of child.allowed) {
      if (r[field] === undefined) continue;
      out[field] = coerce(field, r[field], child.dateFields);
    }
    return out;
  });
}

/** Velden die NOOIT naar de client lekken in pull-records. */
const PULL_OMIT = new Set(['internalNotes']);

/** db-row → wire-record voor pull (v3 = Beheer-veldnamen; alleen interne velden strippen). */
export function toWire<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!PULL_OMIT.has(k)) out[k] = v;
  }
  return out as Partial<T>;
}
