// v2: de PWA stuurt al Beheer-veldnamen, dus GEEN rename meer — wel een strikte
// WHITELIST per entiteit (nooit blind ...data in Prisma spreaden) + datum-coercie.
// orgId wordt NOOIT door de client gezet: de service injecteert die uit de hiërarchie.

export type SyncEntityKey = 'inspectionPlans' | 'assets' | 'findings';

interface EntityConfig {
  /** Prisma-modelnaam (delegate-key op PrismaService) */
  model: 'inspectionPlan' | 'asset' | 'finding';
  /** Singular entityType voor conflicts/errors in de response */
  singular: 'inspectionPlan' | 'asset' | 'finding';
  /** Heeft soft-delete via deletedAt (tombstone) */
  softDelete: true;
  /** Velden die de client mag zetten (scalars). orgId/ id staan hier NIET in. */
  allowed: string[];
  /** Velden die als Date geparsed moeten worden */
  dateFields: string[];
  /** Waar orgId vandaan komt: het eigen plan, of via een parent-FK */
  org: { from: 'self' } | { from: 'parent'; fkField: string; parentModel: 'inspectionPlan' | 'asset' };
}

const PLAN_DATES = ['plannedDate', 'deadline', 'startedAt', 'submittedAt', 'reviewedAt', 'approvedAt', 'completedAt'];
const FINDING_DATES = ['resolvedAt'];

export const SYNC_ENTITIES: Record<SyncEntityKey, EntityConfig> = {
  inspectionPlans: {
    model: 'inspectionPlan',
    singular: 'inspectionPlan',
    softDelete: true,
    org: { from: 'self' },
    dateFields: PLAN_DATES,
    allowed: [
      'contactId', 'projectId', 'inspectionTemplateId', 'projectName', 'description',
      'referenceNumber', 'normTypeCode', 'inspectionTypeCode', 'addressStreet',
      'addressHouseNumber', 'addressPostalCode', 'addressCity', 'gpsLatitude', 'gpsLongitude',
      'plannedDate', 'plannedDurationHours', 'deadline', 'assignedTo', 'reviewerId',
      'installationResponsibleId', 'statusCode', 'notes', 'internalNotes', 'metadata',
      ...PLAN_DATES, 'createdBy', 'deviceId',
    ],
  },
  assets: {
    model: 'asset',
    singular: 'asset',
    softDelete: true,
    org: { from: 'parent', fkField: 'inspectionPlanId', parentModel: 'inspectionPlan' },
    dateFields: [],
    allowed: [
      'inspectionPlanId', 'parentAssetId', 'locationId', 'assetType', 'name', 'identifier',
      'locationDescription', 'sortOrder', 'statusCode', 'technicalData', 'notes',
      'createdBy', 'deviceId',
    ],
  },
  findings: {
    model: 'finding',
    singular: 'finding',
    softDelete: true,
    org: { from: 'parent', fkField: 'assetId', parentModel: 'asset' },
    dateFields: FINDING_DATES,
    allowed: [
      'assetId', 'visualInspectionId', 'measurementRecordId', 'findingTemplateId',
      'inspectionType', 'shortDescription', 'longDescription', 'classificationValues',
      'locationDescription', 'recommendation', 'recommendationCustom', 'normReference',
      'checklistItemId', 'statusCode', 'resolvedAt', 'resolvedBy', 'resolutionNotes',
      ...FINDING_DATES, 'createdBy', 'deviceId',
    ],
  },
};

/** Whitelist + datum-coercie. Onbekende velden (incl. orgId/id/_pendingSync) worden genegeerd. */
export function toDbData(key: SyncEntityKey, data: Record<string, unknown>): Record<string, unknown> {
  const cfg = SYNC_ENTITIES[key];
  const out: Record<string, unknown> = {};
  for (const field of cfg.allowed) {
    if (data[field] === undefined) continue;
    const v = data[field];
    out[field] = cfg.dateFields.includes(field) && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
}

/** Velden die NOOIT naar de client lekken in pull-records. */
const PULL_OMIT = new Set(['internalNotes']);

/** db-row → wire-record voor pull (v2 = Beheer-veldnamen; alleen interne velden strippen). */
export function toWire<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!PULL_OMIT.has(k)) out[k] = v;
  }
  return out as Partial<T>;
}
