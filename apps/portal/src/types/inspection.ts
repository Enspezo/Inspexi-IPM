import type { ContactSummary } from './products';
import type { ProjectPhaseRef } from './projects';
import type { LocationSummary, UserSummary } from './requests';

// ─── Fase 1: Inspectiedomein ─────────────────────────────
// Core + config/template types geport uit de Inspexi-App.
// Status-/type-codes (statusCode, normTypeCode, ...) zijn vrije code-strings
// gekoppeld aan per-org lookups (InspectionLookupOption), GEEN enums.

// ── Per-org lookups ──
/**
 * Generieke lookup-rij voor de 11 overschrijfbare status/type-lijsten
 * (inspectietype, plan-/asset-/finding-/report-status, signatory-type,
 * signer-role, pass/fail, resolutie, client-request type/status).
 * orgId null = globale systeemdefault; org-rij met dezelfde `code` overschrijft.
 */
export interface InspectionLookupOption {
  id: string;
  orgId: string | null;
  code: string;
  label: string;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

// ── Vaste enums (code-gebonden, niet org-uitbreidbaar) ──
export enum InspectionExecStatus {
  not_started = 'not_started',
  in_progress = 'in_progress',
  completed = 'completed',
}

export enum FindingInspectionType {
  visual = 'visual',
  measurement = 'measurement',
}

export enum PhotoEntityType {
  asset = 'asset',
  finding = 'finding',
  inspection_plan = 'inspection_plan',
  location = 'location',
}

export enum MeasurementDataType {
  number = 'number',
  text = 'text',
  select = 'select',
  boolean = 'boolean',
}

export enum ChecklistStatus {
  CONCEPT = 'CONCEPT',
  ACTIEF = 'ACTIEF',
  VERVALLEN = 'VERVALLEN',
}

export enum TemplateStatus {
  CONCEPT = 'CONCEPT',
  ACTIEF = 'ACTIEF',
  VERVALLEN = 'VERVALLEN',
}

export enum AssetFieldType {
  text = 'text',
  number = 'number',
  select = 'select',
  checkbox = 'checkbox',
  date = 'date',
  textarea = 'textarea',
}

export enum DocumentType {
  PLAN = 'PLAN',
  REPORT = 'REPORT',
}

export enum SectionType {
  STATIC = 'STATIC',
  REPEATING = 'REPEATING',
  TABLE_OF_CONTENTS = 'TABLE_OF_CONTENTS',
  SIGNATURE_BLOCK = 'SIGNATURE_BLOCK',
  CONDITIONAL = 'CONDITIONAL',
}

/** Hoe een DocumentTemplate is opgebouwd (Fase 4). */
export enum TemplateMode {
  SECTIONS = 'SECTIONS',
  BLOCKS = 'BLOCKS',
  DOCX = 'DOCX',
}

export interface DocumentSection {
  id: string;
  documentTemplateId: string;
  code: string;
  title: string;
  sectionType: SectionType;
  contentHtml: string | null;
  repeatOn: string | null;
  repeatItemTemplate: string | null;
  condition: string | null;
  sortOrder: number;
  includeInToc: boolean;
  pageBreakBefore: boolean;
  pageBreakAfter: boolean;
  parentSectionId: string | null;
  childSections?: DocumentSection[];
}

export interface DocumentTemplateDocxRevision {
  id: string;
  documentTemplateId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  uploadedById: string;
  uploadedBy?: { id: string; firstName: string; lastName: string };
  version: number;
  createdAt: string;
}

/**
 * Plan- of rapport-document-template van een inspectie-template (Fase 4).
 * `contentBlocks` is de block-editor-payload (BLOCKS-modus) — getypt als
 * `unknown[]` om `@/types` losgekoppeld te houden van de block-editor-module;
 * de detailpagina cast naar `DocContentBlock[]`.
 */
export interface DocumentTemplate {
  id: string;
  inspectionTemplateId: string;
  documentType: DocumentType;
  pageSize: string;
  orientation: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  headerHtml: string | null;
  footerHtml: string | null;
  coverPageHtml: string | null;
  templateMode: TemplateMode;
  contentBlocks: unknown[] | null;
  docxStorageKey: string | null;
  docxFileName: string | null;
  docxFileSize: number | null;
  createdAt: string;
  updatedAt: string;
  sections?: DocumentSection[];
}

export enum GeneratedDocumentStatus {
  DRAFT = 'DRAFT',
  PENDING_SIGNATURES = 'PENDING_SIGNATURES',
  SIGNED = 'SIGNED',
  FINALIZED = 'FINALIZED',
}

export enum SignatureStatus {
  PENDING = 'PENDING',
  REQUESTED = 'REQUESTED',
  SIGNED = 'SIGNED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export interface DocumentSignature {
  id: string;
  generatedDocumentId: string;
  signerRoleCode: string;
  signerName: string | null;
  signerEmail: string | null;
  signerFunction: string | null;
  signatureImage: string | null;
  signedAt: string | null;
  signedIpAddress: string | null;
  signatureRequestId: string | null;
  signatureRequestSentAt: string | null;
  signatureRequestUrl: string | null;
  status: SignatureStatus;
}

/** Gegenereerd inspectie-document (plan of rapport) — lifecycle + ondertekening. */
export interface GeneratedDocument {
  id: string;
  orgId: string;
  documentTemplateId: string;
  inspectionPlanId: string;
  documentType: DocumentType;
  status: GeneratedDocumentStatus;
  isEdited: boolean;
  editedAt: string | null;
  pdfUrl: string | null;
  wordUrl: string | null;
  generatedAt: string;
  generatedBy: string;
  finalizedAt: string | null;
  signatures?: DocumentSignature[];
}

export enum MeasurementSheetTemplateStatus {
  CONCEPT = 'CONCEPT',
  ACTIEF = 'ACTIEF',
  VERVALLEN = 'VERVALLEN',
}

export enum MeasurementSheetFieldType {
  NUMBER = 'NUMBER',
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  CHECKBOX = 'CHECKBOX',
  DROPDOWN = 'DROPDOWN',
  CALCULATED = 'CALCULATED',
  PHOTO = 'PHOTO',
}

export enum MeasurementSheetFieldWidth {
  QUARTER = 'QUARTER',
  THIRD = 'THIRD',
  HALF = 'HALF',
  TWO_THIRDS = 'TWO_THIRDS',
  THREE_QUARTERS = 'THREE_QUARTERS',
  FULL = 'FULL',
}

export enum PassFailOperator {
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
  EQ = 'EQ',
  RANGE = 'RANGE',
  IN = 'IN',
}

export enum MeasurementSheetRecordStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  VALIDATED = 'VALIDATED',
}

export enum MarkerType {
  ASSET = 'ASSET',
  MEASUREMENT = 'MEASUREMENT',
  FINDING = 'FINDING',
}

// ── Core entities ──
export interface InspectionPlan {
  id: string;
  orgId: string;
  contactId: string;
  projectId: string | null;
  projectPhaseId: string | null;
  inspectionTemplateId: string | null;
  locationId: string | null;
  projectName: string;
  description: string | null;
  referenceNumber: string | null;
  normTypeCode: string;
  inspectionTypeCode: string;
  addressStreet: string | null;
  addressHouseNumber: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  plannedDate: string | null;
  plannedDurationHours: string | null;
  deadline: string | null;
  assignedTo: string | null;
  reviewerId: string | null;
  statusCode: string;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  installationResponsibleId: string | null;
  notes: string | null;
  internalNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  lastModifiedBy: string | null;
  deviceId: string | null;
  deletedAt: string | null;
  contact?: ContactSummary;
  project?: { id: string; projectNumber: string } | null;
  projectPhase?: ProjectPhaseRef | null;
  assignedUser?: UserSummary | null;
  reviewer?: UserSummary | null;
  inspectionTemplate?: InspectionTemplate | null;
  location?: LocationSummary | null;
  scopeLocations?: InspectionPlanLocation[];
  signatures?: Signature[];
  reports?: Report[];
}

/** Unified recursive node: één boom met LOCATION- en ASSET-knopen (MAIC-model). */
export enum AssetNodeType {
  LOCATION = 'LOCATION',
  ASSET = 'ASSET',
}

export interface AssetNode {
  id: string;
  orgId: string;
  nodeType: AssetNodeType;
  parentId: string | null;
  /** Alleen gevuld op de root-LOCATION-node (1:1 met een CRM-locatie). */
  rootLocationId: string | null;
  typeCode: string;
  /** Server-toegekend, uniek-per-org nodenummer (read-only). */
  nodeNumber: string | null;
  name: string;
  identifier: string | null;
  description: string | null;
  technicalData: Record<string, unknown>;
  statusCode: string;
  notes: string | null;
  sortOrder: number;
  /** ltree materialized path (server-maintained); niet via Prisma Client schrijfbaar. */
  path: string | null;
  depth: number;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  deletedAt: string | null;
  // Relaties / include-projecties:
  parent?: AssetNode | null;
  children?: AssetNode[];
  rootLocation?: LocationSummary | null;
  findings?: Finding[];
  // Berekende projectie-velden uit de tree/lijst-endpoints:
  childCount?: number;
  findingCount?: number;
  visualInspectionStatus?: string;
  measurementStatus?: string;
  /** Alleen in de planboom (GET /inspection-plans/:id/tree): valt deze LOCATION binnen de scope. */
  inScope?: boolean;
}

/** Koppeling van een inspectieplan aan een deellocatie-node (scope). */
export interface InspectionPlanLocation {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  assetNodeId: string;
  isPrimary: boolean;
  assetNode?: AssetNode;
}

/**
 * Legacy compat-shape van de assets-wrappers (GET /assets,
 * GET /inspection-plans/:id/assets?flat=true). Deze endpoints mappen ASSET-nodes
 * terug op het oude Asset-contract; de boom-UI gebruikt {@link AssetNode}.
 */
export interface Asset {
  id: string;
  parentAssetId: string | null;
  assetType: string;
  name: string;
  identifier: string | null;
  locationDescription: string | null;
  sortOrder: number;
  statusCode: string;
  technicalData: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Alleen aanwezig op detail-/uitvoeringsprojecties. */
  inspectionPlanId?: string | null;
  findingCount?: number;
  _count?: Record<string, number>;
}

/**
 * Legacy compat-shape van de inspection-locations-wrapper
 * (GET /inspection-plans/:id/locations?flat=true). Mapt LOCATION-nodes terug op
 * het oude contract; de boom-UI gebruikt {@link AssetNode}.
 */
export interface InspectionLocation {
  id: string;
  parentLocationId: string | null;
  locationType: string;
  name: string;
  identifier: string | null;
  description: string | null;
  sortOrder: number;
  technicalData: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Finding {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  assetNodeId: string;
  visualInspectionId: string | null;
  measurementRecordId: string | null;
  findingTemplateId: string | null;
  inspectionType: FindingInspectionType;
  shortDescription: string;
  longDescription: string | null;
  classificationValues: Record<string, unknown>;
  locationDescription: string | null;
  locationMarker: Record<string, unknown> | null;
  recommendation: string | null;
  recommendationCustom: string | null;
  normReference: string | null;
  checklistItemId: string | null;
  statusCode: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  deletedAt: string | null;
  assetNode?: AssetNode;
  findingTemplate?: FindingTemplate | null;
}

export interface StandaloneMeasurement {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  locationNodeId: string | null;
  linkedAssetNodeId: string | null;
  measurementType: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string | null;
  createdBy?: string | null;
  deviceId?: string | null;
}

// ── Locatie-afbeelding (plattegrond) + markers ──
export interface LocationImageMarker {
  id: string;
  orgId: string;
  locationImageId: string;
  positionX: number; // % 0-100
  positionY: number; // % 0-100
  markerType: MarkerType;
  assetNodeId: string | null;
  findingId: string | null;
  standaloneMeasurementId: string | null;
  annotation: Record<string, unknown> | null;
  label: string | null;
  color: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  // Door de API meegestuurde (deels geselecteerde) relaties:
  assetNode?: Pick<AssetNode, 'id' | 'name' | 'typeCode' | 'nodeType' | 'statusCode'> | null;
  finding?: Pick<Finding, 'id' | 'shortDescription' | 'statusCode' | 'classificationValues'> | null;
  standaloneMeasurement?: Pick<StandaloneMeasurement, 'id' | 'measurementType' | 'description'> | null;
}

export interface LocationImage {
  id: string;
  orgId: string;
  nodeId: string;
  storagePath: string;
  thumbnailPath: string | null;
  originalFilename: string | null;
  fileSize: number | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  markers?: LocationImageMarker[];
}

export interface Signature {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  signatoryTypeCode: string;
  signatoryName: string;
  signatoryFunction: string | null;
  signatoryUserId: string | null;
  signatoryContactId: string | null;
  signatureData: string;
  signatureHash: string | null;
  signedAt: string;
  ipAddress: string | null;
  deviceInfo: Record<string, unknown> | null;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  syncedAt: string | null;
  deviceId: string | null;
}

export interface Report {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  version: number;
  templateId: string | null;
  statusCode: string;
  customContent: Record<string, unknown>;
  pdfPath: string | null;
  wordPath: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  sentAt: string | null;
  sentTo: unknown[];
  deliveryStatus: string | null;
  generatedAt: string | null;
  fileSize: number | null;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ── Norm & classificatie ──
export interface NormTypeDefinition {
  id: string;
  code: string;
  label: string;
  description: string | null;
  assetTypes: string[];
  classificationModelId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string;
  classificationModel?: ClassificationModel | null;
}

export interface ClassificationModel {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  characteristics?: ClassificationCharacteristic[];
}

export interface ClassificationCharacteristic {
  id: string;
  classificationModelId: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  options?: ClassificationOption[];
}

export interface ClassificationOption {
  id: string;
  characteristicId: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
}

// ── Categorieën (constatering- & checklist-item-categorieën) ──
export interface Category {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  parent?: Category | null;
  children?: Category[];
}

// ── Checklists ──
export interface Checklist {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  code: string | null;
  name: string;
  description: string | null;
  normTypeCode: string;
  assetTypes: string[];
  locationTypes: string[];
  version: string;
  status: ChecklistStatus;
  previousVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  /** Door de API meegestuurd op detail: gekoppelde items via de join-tabel. */
  itemLinks?: ChecklistItemLink[];
}

/** Koppeling tussen een Checklist en een ChecklistItem uit de bibliotheek. */
export interface ChecklistItemLink {
  id: string;
  checklistId: string;
  checklistItemId: string;
  sortOrder: number;
  isRequired: boolean;
  categoryOverride: string | null;
  checklistItem?: ChecklistItem & { category?: Category | null };
}

export interface ChecklistItem {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  code: string | null;
  question: string;
  instruction: string | null;
  normReference: string | null;
  categoryId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ── Templates (constatering / asset- & locatietype / inspectie / meetstaat) ──
export interface FindingTemplate {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  code: string | null;
  categoryId: string | null;
  shortDescription: string;
  longDescription: string | null;
  explanation: string | null;
  normReference: string | null;
  classificationModelId: string;
  defaultClassification: Record<string, unknown>;
  usageCount: number;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AssetTypeDefinition {
  id: string;
  orgId: string | null;
  code: string;
  shortCode: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  normTypes: unknown[];
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  fields?: AssetTypeField[];
}

export interface AssetTypeField {
  id: string;
  assetTypeDefinitionId: string;
  fieldKey: string;
  label: string;
  description: string | null;
  helpText: string | null;
  fieldType: AssetFieldType;
  isRequired: boolean;
  defaultValue: string | null;
  placeholder: string | null;
  validationRules: Record<string, unknown>;
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
  displayWidth: string | null;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Toegestaan ouder-type voor een asset-type (parent-constraint). */
export interface AssetTypeConstraint {
  id: string;
  assetTypeDefinitionId: string;
  allowedParentTypeId: string | null;
  isRequired: boolean;
  createdAt: string;
  allowedParentType?: { id: string; code: string; name: string } | null;
}

export interface LocationTypeDefinition {
  id: string;
  orgId: string | null;
  code: string;
  shortCode: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  normTypes: unknown[];
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  fields?: LocationTypeField[];
}

export interface LocationTypeField {
  id: string;
  locationTypeDefinitionId: string;
  fieldKey: string;
  label: string;
  description: string | null;
  helpText: string | null;
  fieldType: AssetFieldType;
  isRequired: boolean;
  defaultValue: string | null;
  placeholder: string | null;
  validationRules: Record<string, unknown>;
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
  displayWidth: string | null;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Toegestaan ouder-type voor een locatie-type (parent-constraint). */
export interface LocationTypeConstraint {
  id: string;
  locationTypeDefinitionId: string;
  allowedParentTypeId: string | null;
  isRequired: boolean;
  createdAt: string;
  allowedParentType?: { id: string; code: string; name: string } | null;
}

export interface InspectionTemplate {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  forkedFromId: string | null;
  code: string;
  name: string;
  description: string | null;
  normTypeCode: string;
  classificationModelId: string;
  version: string;
  status: TemplateStatus;
  previousVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  classificationModel?: ClassificationModel;
}

export interface MeasurementSheetTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  normTypeCode: string;
  assetTypes: string[];
  locationTypes: string[];
  version: string;
  status: MeasurementSheetTemplateStatus;
  previousVersionId: string | null;
  finalCheckRules: unknown[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  sections?: MeasurementSheetSection[];
}

export interface MeasurementSheetSection {
  id: string;
  templateId: string;
  code: string;
  name: string;
  description: string | null;
  isRepeating: boolean;
  minRows: number;
  sortOrder: number;
  collapsible: boolean;
  defaultCollapsed: boolean;
  rowValidationRules: unknown[];
  fields?: MeasurementSheetField[];
}

export interface MeasurementSheetField {
  id: string;
  sectionId: string;
  code: string;
  name: string;
  description: string | null;
  fieldType: MeasurementSheetFieldType;
  sortOrder: number;
  placeholder: string | null;
  width: MeasurementSheetFieldWidth;
  unit: string | null;
  decimals: number | null;
  minValue: string | null;
  maxValue: string | null;
  dropdownOptions: Record<string, unknown> | null;
  formula: string | null;
  formulaDependencies: string[];
  isRequired: boolean;
  passFailEnabled: boolean;
  passFailOperator: PassFailOperator | null;
  passFailValue: string | null;
  passFailMinValue: string | null;
  passFailMaxValue: string | null;
  passFailValues: Record<string, unknown> | null;
  passFailFailMessage: string | null;
  autoFindingEnabled: boolean;
  autoFindingTemplateId: string | null;
  copyValueOnNewRow: boolean;
  allowBulkEdit: boolean;
}

// ─── Ingevulde meetstaat-records (snapshot van een template) ───
// Een record bevriest het template (templateSnapshot) bij aanmaken en bewaart de
// ingevulde waarden in `data` (sectie → rij → veld). De staf bekijkt dit read-only;
// invullen gebeurt in het veld (PWA).

/** Eén veldwaarde in record.data: ingevulde waarde + pass/fail-uitkomst. */
export interface MeasurementSheetFieldValue {
  value: unknown;
  passFail?: 'pass' | 'fail' | null;
}

/** Bevroren veld in templateSnapshot.sections[].fields[] (subset van MeasurementSheetField). */
export interface MeasurementSheetSnapshotField {
  code: string;
  name: string;
  description: string | null;
  fieldType: MeasurementSheetFieldType;
  sortOrder: number;
  placeholder: string | null;
  width: MeasurementSheetFieldWidth;
  unit: string | null;
  decimals: number | null;
}

/** Bevroren sectie in templateSnapshot.sections[]. */
export interface MeasurementSheetSnapshotSection {
  code: string;
  name: string;
  description: string | null;
  isRepeating: boolean;
  minRows: number;
  sortOrder: number;
  fields: MeasurementSheetSnapshotField[];
}

/** Het ingevroren template binnen een record. */
export interface MeasurementSheetTemplateSnapshot {
  id: string;
  code: string;
  name: string;
  version: string;
  normTypeCode: string;
  finalCheckRules?: unknown[];
  sections: MeasurementSheetSnapshotSection[];
}

/** Resultaat van één final-check-regel (record.finalCheckResults.results[]). */
export interface MeasurementSheetFinalCheckRuleResult {
  ruleType: string;
  passed: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

/** record.finalCheckResults: macro-uitkomst van de afronding. */
export interface MeasurementSheetFinalCheckResults {
  passed: boolean;
  results: MeasurementSheetFinalCheckRuleResult[];
}

/** record.data: sectiecode → rij-index ("0", "1", …) → veldcode → waarde. */
export type MeasurementSheetRecordData = Record<
  string,
  Record<string, Record<string, MeasurementSheetFieldValue>>
>;

export interface MeasurementSheetRecord {
  id: string;
  orgId: string;
  templateId: string;
  assetNodeId: string;
  inspectionPlanId: string;
  templateVersion: string;
  templateSnapshot: MeasurementSheetTemplateSnapshot;
  status: MeasurementSheetRecordStatus;
  data: MeasurementSheetRecordData;
  finalCheckExecuted: boolean;
  finalCheckPassed: boolean | null;
  finalCheckResults: MeasurementSheetFinalCheckResults | null;
  syncedAt: string | null;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  createdBy: string;
  usedInstrumentIds: string[];
  // Include-projecties uit de endpoints:
  template?: { id: string; code: string; name: string; version: string };
  assetNode?: { id: string; name: string; typeCode: string; inspectionPlanId?: string };
}

// ─── Voice-prompts (3-lagen prompt-model voor spraakinvoer) ───

/** Laag 1: systeem-base-prompt (SUPERUSER, exact één actief). */
export interface VoiceBasePrompt {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Laag 2: per-org template-prompt op een meetstaat-template (ORG_ADMIN). */
export interface VoiceTemplatePrompt {
  id: string;
  orgId: string;
  templateId: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Meegestuurd door de API (include) — handig voor weergave. */
  template?: { id: string; name: string };
}

// ─── AI-review van inspectierapporten (PRD-13) ───

export enum AiReviewRunStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum AiReviewItemSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  SUGGESTION = 'SUGGESTION',
  INFO = 'INFO',
}

export enum AiReviewItemStatus {
  OPEN = 'OPEN',
  CHECKED = 'CHECKED',
  DISMISSED = 'DISMISSED',
}

/** Eén AI-analyse-run over een ingediend inspectieplan (adviserend, nooit blokkerend). */
export interface AiReviewRun {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  generatedDocumentId: string | null;
  status: AiReviewRunStatus;
  /** Null = automatisch gestart bij indienen ter review. */
  triggeredBy: string | null;
  /** Gebruikt Claude-model (audit/kosten). */
  model: string;
  /** NL-samenvatting van de AI. */
  summary: string | null;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  items?: AiReviewItem[];
}

/** Eén AI-aandachtspunt, af te vinken of af te wijzen door de reviewer. */
export interface AiReviewItem {
  id: string;
  orgId: string;
  runId: string;
  severity: AiReviewItemSeverity;
  /** Vrije NL-categorie uit de prompt-taxonomie (VOLLEDIGHEID, CONSISTENTIE, …). */
  category: string;
  title: string;
  description: string;
  assetNodeId: string | null;
  findingId: string | null;
  measurementRecordId: string | null;
  status: AiReviewItemStatus;
  checkedBy: string | null;
  checkedAt: string | null;
  sortOrder: number;
  createdAt: string;
}
