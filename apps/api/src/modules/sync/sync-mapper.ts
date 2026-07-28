// v3: de PWA stuurt al Beheer-veldnamen, dus GEEN rename meer — wel een strikte
// WHITELIST per entiteit (nooit blind ...data in Prisma spreaden) + datum-coercie.
// orgId wordt NOOIT door de client gezet: de service injecteert die uit de eigen rij.
// Ook `createdBy` en `inspectorId` zijn server-owned (staan niet in `allowed`): de
// service forceert ze op de pushende JWT-gebruiker. `userFkChecks` valideert de
// overige gebruiker-FK's (assignedTo/reviewerId/resolvedBy) tegen de eigen org.
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

import type { z } from 'zod';
import { validateJsonColumn } from '@/common';
import { planMetadataSchema, PLAN_METADATA_LABEL } from '../inspection-plans/schemas/plan-metadata.schema';
import { technicalDataSchema, TECHNICAL_DATA_LABEL } from '../asset-nodes/schemas/technical-data.schema';
import {
  classificationValuesSchema,
  CLASSIFICATION_VALUES_LABEL,
} from '../findings/schemas/classification-values.schema';
import {
  checklistResultsSchema,
  CHECKLIST_RESULTS_LABEL,
} from '../visual-inspections/schemas/checklist-results.schema';
import { measurementsSchema, MEASUREMENTS_LABEL } from '../measurement-records/schemas/measurements.schema';
import {
  sheetRecordDataSchema,
  SHEET_RECORD_DATA_LABEL,
  templateSnapshotSchema,
  TEMPLATE_SNAPSHOT_LABEL,
  finalCheckResultsSchema,
  FINAL_CHECK_RESULTS_LABEL,
} from '../measurement-sheet-records/schemas/sheet-record-data.schema';

/**
 * Het contract-versienummer; bump bij elke breaking wijziging aan de wire-vorm.
 *
 * v4 (WP-D1, besluit A1 — B-209/B-223e): `updatedAt` is het universele
 * versie-anker voor conflictdetectie.
 *  - Push-updates dragen `baseVersion` (de laatst geziene server-`updatedAt`);
 *    ontbreekt élk anker bij een update van een bestaand record → fail-closed
 *    conflict ("geen basis bekend" is nooit meer "geen conflict").
 *  - Push-respons draagt `applied[]` (nieuwe server-`updatedAt` per geslaagde
 *    create/update) zodat de client zijn basis exact kan bijwerken.
 *  - Pull-envelope draagt `openConflicts[]` (openstaande conflicten van deze
 *    gebruiker) zodat een conflict ook in een nieuwe sessie zichtbaar is.
 * Compatibiliteit: een v3-PWA blokkeert zichzelf op de pull-guard
 * (contractVersion ≠ verwacht) en pusht daarna niet; een in-flight v3-push
 * met `syncedAt` valt terug op de oude vergelijking (nooit stil overschrijven).
 */
export const SYNC_CONTRACT_VERSION = 4;

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
export type FkCheckModel =
  | 'assetNode'
  | 'inspectionPlan'
  | 'location'
  | 'user'
  | 'contactPerson'
  | 'contact'
  | 'project'
  | 'visualInspection'
  | 'measurementRecord';

/**
 * Inkomend client-record (wire) — Beheer-veldnamen. Alleen de sleutels die de service
 * expliciet uitleest zijn benoemd; de overige whitelisted velden komen via de
 * index-signatuur binnen en worden door {@link toDbData} gefilterd.
 */
export interface SyncRecordData {
  id?: string;
  /**
   * v4-versie-anker (besluit A1): de nieuwste server-`updatedAt` die de client
   * voor dit record heeft gezien (gevuld bij pull en push-ack). De server
   * vergelijkt hiertegen voor conflictdetectie.
   */
  baseVersion?: string;
  /** Legacy v3-anker (transitie): alleen gelezen als `baseVersion` ontbreekt. */
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
  /**
   * Of de service `createdBy` server-side moet zetten op de pushende gebruiker
   * (modellen zonder createdBy-kolom: false). De client-waarde wordt NOOIT
   * vertrouwd — `createdBy` staat daarom ook niet in `allowed`.
   */
  injectCreatedBy: boolean;
  /**
   * Of de service `inspectorId` server-side moet forceren op de pushende
   * gebruiker (bij create én update). Zoals `createdBy` staat het veld niet in
   * `allowed`, zodat de client het niet kan spoofen.
   */
  injectInspectorId?: boolean;
  /** FK-velden die — indien aanwezig — tot dezelfde org moeten horen (cross-tenant). */
  fkChecks?: Array<{ field: string; model: FkCheckModel; label: string }>;
  /**
   * Velden die bij een `create` aanwezig moeten zijn. Prisma zou een ontbrekende
   * verplichte kolom toch weigeren, maar dan met een rauwe Engelstalige
   * driver-melding in `errors[]` (zo bleef B-207 maandenlang onleesbaar voor de
   * inspecteur). Deze check geeft een nette Nederlandse `<label> ontbreekt`.
   */
  requiredOnCreate?: Array<{ field: string; label: string }>;
  /**
   * User-FK-velden (bv. `assignedTo`, `resolvedBy`) die — indien aanwezig — tot
   * dezelfde org moeten horen. Client mag ze zetten (i.t.t. createdBy/inspectorId),
   * maar nooit naar een gebruiker buiten de eigen tenant wijzen.
   */
  userFkChecks?: string[];
  /**
   * Boom-integriteit: het uitvoeringsrecord moet aan een asset-node hangen die in
   * de boom van zijn inspectieplan zit (rootLocationId === plan.locationId). Wordt
   * — net als in het REST-pad — via `AssetNodesService.assertNodeInPlanTree`
   * afgedwongen. Overgeslagen als het plan (nog) geen hoofdlocatie heeft.
   */
  treeCheck?: { nodeField: string; planField: string };
  /** Optioneel: kind-records die genest meereizen. */
  nestedChild?: NestedChildConfig;
}

// reviewedAt/approvedAt zijn bewust GEEN client-velden: de vier-ogen-review
// (PRD-13) gebeurt in het portal door REVIEW_ROLES, nooit vanaf het device.
// Client-schrijfbaar maken zou de vier-ogen-gate via /sync omzeilbaar maken.
const PLAN_DATES = ['plannedDate', 'deadline', 'startedAt', 'submittedAt', 'completedAt'];
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
      ...PLAN_DATES, 'deviceId',
    ],
    // Toewijs-FK's naar gebruikers: client mag ze zetten, maar niet cross-tenant.
    userFkChecks: ['assignedTo', 'reviewerId'],
    // installationResponsibleId is een FK naar ContactPerson (niet User) — valideer
    // tegen het juiste model, gelijk aan het REST-pad (inspection-plans.service).
    // contactId/projectId/locationId zijn altijd org-eigen (geen system-variant) en
    // worden — net als in het REST-pad — met een platte org-check gevalideerd.
    // NB: inspectionTemplateId kent wél system-rijen (orgId null) en wordt daarom
    // niet hier maar systeem-bewust in het generatiepad afgeschermd (SYNC-2).
    fkChecks: [
      { field: 'installationResponsibleId', model: 'contactPerson', label: 'Installatieverantwoordelijke' },
      { field: 'contactId', model: 'contact', label: 'Relatie' },
      { field: 'projectId', model: 'project', label: 'Project' },
      { field: 'locationId', model: 'location', label: 'Hoofdlocatie' },
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
      'deviceId',
    ],
    fkChecks: [
      { field: 'parentId', model: 'assetNode', label: 'Bovenliggende node' },
      { field: 'rootLocationId', model: 'location', label: 'Hoofdlocatie' },
    ],
  },
  // NB (WP-A2): de push verwerkt entiteiten in déze objectvolgorde — ouders vóór
  // kinderen. visualInspections en measurementRecords staan daarom vóór findings:
  // een finding uit dezelfde batch verwijst met visualInspectionId/
  // measurementRecordId naar deze records (B-206) en zou anders op de FK stranden.
  visualInspections: {
    model: 'visualInspection',
    singular: 'visualInspection',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: false, // VisualInspection heeft geen createdBy-kolom
    injectInspectorId: true, // inspectorId = pushende gebruiker (server-authoritative)
    dateFields: VI_DATES,
    allowed: [
      'assetNodeId', 'inspectionPlanId', 'status', 'checklistResults',
      'startedAt', 'completedAt', 'deviceId',
    ],
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
    ],
    treeCheck: { nodeField: 'assetNodeId', planField: 'inspectionPlanId' },
  },
  measurementRecords: {
    model: 'measurementRecord',
    singular: 'measurementRecord',
    softDelete: true,
    org: { from: 'self' },
    injectCreatedBy: false, // MeasurementRecord heeft geen createdBy-kolom
    injectInspectorId: true, // inspectorId = pushende gebruiker (server-authoritative)
    dateFields: MR_DATES,
    allowed: [
      'assetNodeId', 'inspectionPlanId', 'status', 'measurements',
      'instrumentType', 'instrumentSerial', 'calibrationDate',
      'startedAt', 'completedAt', 'deviceId',
    ],
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
    ],
    treeCheck: { nodeField: 'assetNodeId', planField: 'inspectionPlanId' },
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
      ...FINDING_DATES, 'deviceId',
    ],
    // visualInspectionId/measurementRecordId (WP-A2 · B-206): zonder deze checks
    // gaf een onbekende referentie een rauwe Prisma-P2003 in errors[] — en kon een
    // client bovendien cross-tenant naar andermans VI/meetrecord verwijzen.
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
      { field: 'visualInspectionId', model: 'visualInspection', label: 'Visuele inspectie' },
      { field: 'measurementRecordId', model: 'measurementRecord', label: 'Meetrecord' },
    ],
    userFkChecks: ['resolvedBy'],
    treeCheck: { nodeField: 'assetNodeId', planField: 'inspectionPlanId' },
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
      'finalCheckResults', 'completedAt', 'deviceId',
    ],
    fkChecks: [
      { field: 'assetNodeId', model: 'assetNode', label: 'Asset-node' },
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
    ],
    // B-207 (WP-A2): een PWA-payload zonder templateVersion faalde met een rauwe
    // Prisma-melding ("Argument `templateVersion` is missing") in errors[] — de
    // klasse fouten die maandenlang álle meetstaten stil liet stranden. Deze
    // verplichte-velden-check maakt er een leesbare NL-melding van.
    requiredOnCreate: [
      { field: 'templateId', label: 'Meetstaat-template' },
      { field: 'templateVersion', label: 'Template-versie' },
      { field: 'templateSnapshot', label: 'Template-snapshot' },
    ],
    treeCheck: { nodeField: 'assetNodeId', planField: 'inspectionPlanId' },
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
      'linkedAssetNodeId', 'sampleId', 'deviceId',
    ],
    fkChecks: [
      { field: 'inspectionPlanId', model: 'inspectionPlan', label: 'Inspectie' },
      { field: 'locationNodeId', model: 'assetNode', label: 'Locatie-node' },
      { field: 'linkedAssetNodeId', model: 'assetNode', label: 'Gekoppelde asset-node' },
    ],
    treeCheck: { nodeField: 'locationNodeId', planField: 'inspectionPlanId' },
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

/**
 * Per-entiteit velden die als string in de DB staan maar door (oudere) PWA-caches
 * als getal geserialiseerd kunnen worden. De meetstaat-`templateVersion` is
 * server-side een String-kolom ("1.0"), terwijl de gedeelde PWA-typedef `number`
 * zegt — een numerieke waarde zou anders met een rauwe Prisma-typefout stranden
 * (B-207-klasse). Coercen is hier verliesvrij.
 */
const STRING_COERCE_FIELDS: Partial<Record<SyncEntityKey, string[]>> = {
  measurementSheetRecords: ['templateVersion'],
};

/**
 * Per-entiteit JSON-kolom → { schema, label }. De /sync-push omzeilt de class-validator
 * DTO-laag (kale `@IsObject()`), dus valideren we deze vormvrije kolommen hier permissief
 * (dezelfde colocated schema's als het REST-pad) om garbage tegen te houden.
 */
const JSON_FIELD_VALIDATORS: Partial<
  Record<SyncEntityKey, Record<string, { schema: z.ZodTypeAny; label: string }>>
> = {
  inspectionPlans: { metadata: { schema: planMetadataSchema, label: PLAN_METADATA_LABEL } },
  assetNodes: { technicalData: { schema: technicalDataSchema, label: TECHNICAL_DATA_LABEL } },
  findings: {
    classificationValues: { schema: classificationValuesSchema, label: CLASSIFICATION_VALUES_LABEL },
  },
  visualInspections: {
    checklistResults: { schema: checklistResultsSchema, label: CHECKLIST_RESULTS_LABEL },
  },
  measurementRecords: { measurements: { schema: measurementsSchema, label: MEASUREMENTS_LABEL } },
  measurementSheetRecords: {
    data: { schema: sheetRecordDataSchema, label: SHEET_RECORD_DATA_LABEL },
    templateSnapshot: { schema: templateSnapshotSchema, label: TEMPLATE_SNAPSHOT_LABEL },
    finalCheckResults: { schema: finalCheckResultsSchema, label: FINAL_CHECK_RESULTS_LABEL },
  },
};

/**
 * Whitelist + datum-coercie + JSON-vormvalidatie. Onbekende velden (incl.
 * orgId/id/_pendingSync) worden genegeerd; JSON-kolommen met de verkeerde top-level
 * vorm geven een 400 (Nederlandse melding via {@link validateJsonColumn}).
 */
export function toDbData(key: SyncEntityKey, data: Record<string, unknown>): Record<string, unknown> {
  const cfg = SYNC_ENTITIES[key];
  const jsonValidators = JSON_FIELD_VALIDATORS[key];
  const stringCoerce = STRING_COERCE_FIELDS[key];
  const out: Record<string, unknown> = {};
  for (const field of cfg.allowed) {
    if (data[field] === undefined) continue;
    let value = coerce(field, data[field], cfg.dateFields);
    if (stringCoerce?.includes(field) && typeof value === 'number') {
      value = String(value);
    }
    const v = jsonValidators?.[field];
    out[field] = v ? validateJsonColumn(v.schema, value, v.label) : value;
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
