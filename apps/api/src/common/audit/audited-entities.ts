/**
 * Single source of truth for audited entities.
 *
 * `prisma.service.ts` (audit middleware) and `audit-log.service.ts` (history API)
 * used to keep three independent lists in sync by hand — `AUDITED_MODELS`,
 * `MODEL_TABLE_MAP` and `ALLOWED_ENTITY_TYPES`. They drifted: several audited
 * models were missing from the allowed list. All three are now *derived* from the
 * `AUDITED_ENTITIES` registry below, so adding a model is a single edit and the
 * accompanying drift test fails fast if the registry and the Prisma schema
 * disagree.
 *
 * Each entry also carries how the entity should be rendered when it is referenced
 * by a foreign key in another entity's audit trail (see `fk-resolvers.ts`).
 */

export interface AuditedEntity {
  /** Prisma model name (PascalCase). Equals the `entityType` stored in audit logs. */
  model: string;
  /** Database table — must equal the Prisma `@@map(...)` value (asserted in the drift test). */
  table: string;
  /**
   * Ordered candidate fields used to render the entity as a human-readable label;
   * the first non-empty value wins, falling back to the id. Use `display` for
   * composite labels (e.g. first + last name) that a field list cannot express.
   */
  displayFields?: string[];
  /** Composite display override; takes precedence over `displayFields`. */
  display?: (record: Record<string, any>) => string;
}

const fullName = (r: Record<string, any>) =>
  `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
const shortId = (r: Record<string, any>) =>
  r?.id ? String(r.id).substring(0, 8) : '';

export const AUDITED_ENTITIES: readonly AuditedEntity[] = [
  // Foundation
  {
    model: 'User',
    table: 'imp_users',
    display: (r) => fullName(r) || r.email || r.id,
  },
  { model: 'Organization', table: 'imp_organizations', displayFields: ['name', 'slug'] },

  // CRM
  {
    model: 'Contact',
    table: 'imp_contacts',
    display: (r) => r.companyName || fullName(r) || r.email || r.id,
  },
  {
    model: 'ContactPerson',
    table: 'imp_contact_persons',
    display: (r) => fullName(r) || r.email || r.id,
  },
  {
    model: 'Location',
    table: 'imp_locations',
    display: (r) => {
      const parts = [r.street, r.houseNumber, r.city].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : r.name || r.id;
    },
  },
  { model: 'CustomerGroup', table: 'imp_customer_groups', displayFields: ['name'] },

  // Producten & prijzen
  { model: 'Product', table: 'imp_products', displayFields: ['name'] },
  { model: 'PriceTable', table: 'imp_price_tables', displayFields: ['name'] },
  { model: 'PriceTableItem', table: 'imp_price_table_items', displayFields: ['description'] },

  // Aanvragen & offertes
  { model: 'Request', table: 'imp_requests', displayFields: ['title'] },
  { model: 'Quote', table: 'imp_quotes', displayFields: ['quoteNumber', 'subject'] },
  { model: 'QuoteLine', table: 'imp_quote_lines', displayFields: ['description'] },
  { model: 'QuoteTemplate', table: 'imp_quote_templates', displayFields: ['name'] },

  // Overig (beheer)
  { model: 'Document', table: 'imp_documents', displayFields: ['originalName', 'fileName'] },
  { model: 'DocumentTag', table: 'imp_document_tags', displayFields: ['name'] },
  { model: 'Task', table: 'imp_tasks', displayFields: ['title'] },
  { model: 'PlanningItem', table: 'imp_planning_items', displayFields: ['productName'] },
  {
    model: 'CustomFieldDefinition',
    table: 'imp_custom_field_definitions',
    displayFields: ['label', 'fieldName'],
  },
  { model: 'NumberingScheme', table: 'imp_numbering_schemes', displayFields: ['model'] },
  { model: 'EmailTemplate', table: 'imp_email_templates', displayFields: ['name', 'subject'] },
  { model: 'Project', table: 'imp_projects', displayFields: ['projectNumber', 'title'] },
  { model: 'WorkOrder', table: 'imp_work_orders', displayFields: ['workOrderNumber'] },
  { model: 'WorkOrderLine', table: 'imp_work_order_lines', displayFields: ['description'] },

  // Inspectiedomein — configuratie & planning (Fase 1)
  { model: 'InspectionPlan', table: 'imp_inspection_plans', displayFields: ['projectName'] },
  { model: 'Asset', table: 'imp_assets', displayFields: ['name', 'identifier'] },
  { model: 'Finding', table: 'imp_findings', displayFields: ['shortDescription'] },
  {
    model: 'InspectionLocation',
    table: 'imp_inspection_locations',
    displayFields: ['name', 'identifier'],
  },
  { model: 'Checklist', table: 'imp_checklists', displayFields: ['name', 'code'] },
  { model: 'ChecklistItem', table: 'imp_checklist_items', displayFields: ['question', 'code'] },
  { model: 'Category', table: 'imp_categories', displayFields: ['name'] },
  {
    model: 'FindingTemplate',
    table: 'imp_finding_templates',
    displayFields: ['shortDescription', 'code'],
  },
  {
    model: 'ClassificationModel',
    table: 'imp_classification_models',
    displayFields: ['name', 'code'],
  },
  {
    model: 'NormTypeDefinition',
    table: 'imp_norm_type_definitions',
    displayFields: ['label', 'code'],
  },
  {
    model: 'AssetTypeDefinition',
    table: 'imp_asset_type_definitions',
    displayFields: ['name', 'code'],
  },
  {
    model: 'LocationTypeDefinition',
    table: 'imp_location_type_definitions',
    displayFields: ['name', 'code'],
  },
  {
    model: 'InspectionTemplate',
    table: 'imp_inspection_templates',
    display: (r) => [r.name, r.version].filter(Boolean).join(' ') || r.code || r.id,
  },
  {
    model: 'MeasurementSheetTemplate',
    table: 'imp_measurement_sheet_templates',
    display: (r) => [r.name, r.version].filter(Boolean).join(' ') || r.code || r.id,
  },
  {
    model: 'MeasurementSheetRecord',
    table: 'imp_measurement_sheet_records',
    display: (r) => `Meetstaat #${shortId(r)}`,
  },

  // Inspectiedomein — uitvoering (Fase 2)
  {
    model: 'VisualInspection',
    table: 'imp_visual_inspections',
    display: (r) => `Visuele inspectie #${shortId(r)}`,
  },
  {
    model: 'MeasurementRecord',
    table: 'imp_measurement_records',
    display: (r) => (r.instrumentType ? `Meting: ${r.instrumentType}` : `Meting #${shortId(r)}`),
  },
  {
    model: 'StandaloneMeasurement',
    table: 'imp_standalone_measurements',
    displayFields: ['description', 'measurementType'],
  },
  { model: 'LocationImage', table: 'imp_location_images', displayFields: ['originalFilename'] },
  {
    model: 'GeneratedDocument',
    table: 'imp_generated_documents',
    display: (r) => `Document #${shortId(r)}`,
  },
  { model: 'DocumentSignature', table: 'imp_document_signatures', displayFields: ['signerName'] },
  { model: 'ClientRequest', table: 'imp_client_requests', displayFields: ['subject'] },
];

/** Builds a display function from an entry's `display` / `displayFields`, falling back to id. */
function makeDisplay(entry: AuditedEntity): (record: Record<string, any>) => string {
  if (entry.display) return entry.display;
  const fields = entry.displayFields ?? [];
  return (record) => {
    for (const field of fields) {
      const value = record?.[field];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value);
      }
    }
    return record?.id ?? '';
  };
}

/** Models the audit middleware records changes for (`prisma.service.ts`). */
export const AUDITED_MODELS: ReadonlySet<string> = new Set(
  AUDITED_ENTITIES.map((e) => e.model),
);

/** Prisma model → database table (used to fetch the before-state on updates). */
export const MODEL_TABLE_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(AUDITED_ENTITIES.map((e) => [e.model, e.table])),
);

/** Entity types the history API may be queried for — identical to AUDITED_MODELS by construction. */
export const ALLOWED_ENTITY_TYPES: ReadonlySet<string> = AUDITED_MODELS;

/** Display renderer per audited model, keyed by Prisma model name (PascalCase). */
export const ENTITY_DISPLAYS: ReadonlyMap<string, (record: Record<string, any>) => string> =
  new Map(AUDITED_ENTITIES.map((e) => [e.model, makeDisplay(e)]));
