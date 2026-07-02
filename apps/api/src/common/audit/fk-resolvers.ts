/**
 * Foreign-key resolution for the audit trail.
 *
 * The audit history shows raw UUIDs for FK columns (e.g. `locationId`) unless we
 * resolve them to a human-readable label. The previous implementation used a
 * single global `field name → model` map, which could not distinguish the same
 * column name across entities:
 *   - `Asset.locationId` points to an InspectionLocation, but `Quote.locationId`
 *     points to a (Beheer) Location.
 *   - `MeasurementSheetRecord.templateId` points to a MeasurementSheetTemplate,
 *     but `Quote.templateId` points to a QuoteTemplate.
 *
 * Routing is now a `(entityType, field) → target model` lookup derived from the
 * Prisma schema (DMMF), so every FK resolves against the model it actually
 * references — and new FKs are picked up automatically with no maintenance.
 */

import { Prisma } from '@prisma/client';
import { AUDITED_ENTITIES, ENTITY_DISPLAYS } from './audited-entities';

/** Prisma model name (PascalCase) → client delegate (camelCase). */
export function delegateFor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

const shortId = (r: Record<string, any>) => (r?.id ? String(r.id).substring(0, 8) : '');
const fullName = (r: Record<string, any>) =>
  `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();

/**
 * `entityType → (fkColumn → target model)` built from the Prisma datamodel.
 * Only single-column relations are indexed (composite FKs are not display-relevant).
 */
const FK_TARGETS: Map<string, Map<string, string>> = (() => {
  const map = new Map<string, Map<string, string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Map<string, string>();
    for (const field of model.fields) {
      if (field.relationName && field.relationFromFields?.length === 1) {
        fields.set(field.relationFromFields[0], field.type);
      }
    }
    if (fields.size > 0) map.set(model.name, fields);
  }
  return map;
})();

/**
 * Convention fallback for FK columns that have no Prisma relation — bare String
 * user-id columns such as `createdBy` / `generatedBy`. These always reference a
 * `User` regardless of the owning entity, so a flat map is safe. DMMF relations
 * always take precedence, so this never overrides a real relation.
 */
const FALLBACK_FIELD_MODEL: Readonly<Record<string, string>> = {
  createdBy: 'User',
  createdById: 'User',
  ownerId: 'User',
  assignedTo: 'User',
  reviewerId: 'User',
  lastModifiedBy: 'User',
  resolvedBy: 'User',
  projectManagerId: 'User',
  editedBy: 'User',
  generatedBy: 'User',
  handledBy: 'User',
  // NB: OrganizationFeature.updatedById heeft sinds de FK-migratie een echte
  // Prisma-relatie en wordt dus al door FK_TARGETS (DMMF) afgehandeld — geen
  // fallback meer nodig.
};

/**
 * `model name → set of scalar/enum column names`, derived from the Prisma datamodel.
 * Used to build minimal `select` objects for the audit trail (M7) so we never fetch
 * whole rows — including large JSON blobs or sensitive columns — just to compute a
 * diff or render a label. Relation (`object`) fields are excluded.
 */
const MODEL_SCALAR_FIELDS: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    map.set(model.name, new Set(model.fields.filter((f) => f.kind !== 'object').map((f) => f.name)));
  }
  return map;
})();

/** Scalar/enum column names of an audited model, or `undefined` when unknown. */
export function getModelScalarFields(model: string): ReadonlySet<string> | undefined {
  return MODEL_SCALAR_FIELDS.get(model);
}

/**
 * Prisma `select` limited to `id` + the requested fields that are real scalar columns
 * on the model. Returns `undefined` for an unknown model so the caller can fall back
 * to a full fetch. Never selects a non-existent column (which would throw at runtime).
 */
export function scalarSelect(
  model: string,
  fields: Iterable<string>,
): Record<string, true> | undefined {
  const scalars = MODEL_SCALAR_FIELDS.get(model);
  if (!scalars) return undefined;
  const select: Record<string, true> = { id: true };
  for (const field of fields) {
    if (field !== 'id' && scalars.has(field)) select[field] = true;
  }
  return select;
}

/**
 * Candidate label fields any display renderer may read: every `displayFields` entry in
 * the registry plus the fields used by the composite `display()`/lookup renderers.
 * Intersected per model with the real columns, so a `select` stays valid and minimal.
 */
const DISPLAY_CANDIDATE_FIELDS: ReadonlySet<string> = new Set<string>([
  // composite display() + lookup renderers (fk-resolvers + audited-entities):
  'firstName', 'lastName', 'email', 'companyName', 'street', 'houseNumber', 'city',
  'name', 'title', 'label', 'code', 'version', 'instrumentType', 'ticketNumber',
  'subject', 'docxFileName',
  // all declared displayFields across the audited-entity registry:
  ...AUDITED_ENTITIES.flatMap((e) => e.displayFields ?? []),
]);

/** Minimal `select` for rendering a referenced record's display label (M7). */
export function displaySelect(model: string): Record<string, true> | undefined {
  return scalarSelect(model, DISPLAY_CANDIDATE_FIELDS);
}

/**
 * Resolves which model a `(entityType, field)` foreign key points to, or
 * `undefined` when the field is not a foreign key.
 */
export function resolveFkTargetModel(
  entityType: string,
  field: string,
): string | undefined {
  return FK_TARGETS.get(entityType)?.get(field) ?? FALLBACK_FIELD_MODEL[field];
}

/**
 * Display renderers keyed by *target* model. Reuses the audited-entity displays
 * and adds the non-audited lookup targets that FKs can point to.
 */
const LOOKUP_DISPLAYS: Record<string, (r: Record<string, any>) => string> = {
  ContactPersonRoleOption: (r) => r.label || r.code || r.id,
  ProductGroup: (r) => r.name || r.id,
  LostReason: (r) => r.label || r.code || r.id,
  DocumentTemplate: (r) => r.docxFileName || `Documentsjabloon #${shortId(r)}`,
  ClientUser: (r) => fullName(r) || r.email || r.id,
};

const REFERENCE_DISPLAYS: ReadonlyMap<string, (r: Record<string, any>) => string> =
  new Map<string, (r: Record<string, any>) => string>([
    ...ENTITY_DISPLAYS,
    ...Object.entries(LOOKUP_DISPLAYS),
  ]);

/** Renders a referenced record to a human-readable label. */
export function displayReference(model: string, record: Record<string, any>): string {
  const fn = REFERENCE_DISPLAYS.get(model);
  if (fn) return fn(record);
  return record?.name || record?.label || record?.title || record?.code || record?.id || '';
}
