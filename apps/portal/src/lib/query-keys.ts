/**
 * Gecentraliseerde TanStack Query key-factories per domein.
 *
 * Waarom: query-keys werden als losse string-arrays door alle `pages/*​/hooks`
 * heen gedupliceerd, waardoor invalidaties makkelijk uit de pas liepen met de
 * queries die ze moesten verversen. Deze factories zijn de enige bron van
 * waarheid: hooks bouwen hun `queryKey` én hun `invalidateQueries` hiermee.
 *
 * Conventie per domein:
 *   all           → root-array, invalideert het hele domein (list + detail)
 *   lists()       → alle lijst-queries van het domein
 *   list(params)  → één specifieke lijst-query (met filters/paginatie)
 *   detail(id)    → één detail-query
 *   <nested>(id)  → geneste sub-resources (bv. logs, followers, attachments)
 *
 * De array-vormen zijn bewust identiek aan de historische keys, zodat het
 * migreren gedrags-neutraal is: een bredere invalidatie (bv. `all`) blijft
 * via prefix-matching alle onderliggende queries raken.
 */

/** Losse params meegegeven aan een lijst-query (filters, paginatie, sortering). */
type ListParams = unknown;

// ─── CRM ──────────────────────────────────────────────────────────────────

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all] as const,
  list: (params: ListParams) => [...contactKeys.all, params] as const,
  detail: (id: string) => [...contactKeys.all, id] as const,
  logs: (contactId: string) => [...contactKeys.all, contactId, 'logs'] as const,
  locations: (contactId: string) =>
    [...contactKeys.all, contactId, 'locations'] as const,
  search: (q: string) => [...contactKeys.all, 'search', q] as const,
};

export const contactPersonKeys = {
  all: ['contact-persons'] as const,
  lists: () => [...contactPersonKeys.all] as const,
  list: (params: ListParams) => [...contactPersonKeys.all, params] as const,
  detail: (personId: string) => [...contactPersonKeys.all, personId] as const,
};

export const contactPersonRoleKeys = {
  all: ['contact-person-roles'] as const,
};

export const contactPersonLocationKeys = {
  all: ['contact-person-locations'] as const,
  byPerson: (personId: string) =>
    [...contactPersonLocationKeys.all, personId] as const,
};

export const locationContactPersonKeys = {
  all: ['location-contact-persons'] as const,
  byLocation: (locationId: string) =>
    [...locationContactPersonKeys.all, locationId] as const,
};

export const locationKeys = {
  all: ['locations'] as const,
  lists: () => [...locationKeys.all] as const,
  list: (params: ListParams) => [...locationKeys.all, params] as const,
  detail: (locationId: string) => [...locationKeys.all, locationId] as const,
};

export const customerGroupKeys = {
  all: ['customer-groups'] as const,
  lists: () => [...customerGroupKeys.all] as const,
  list: (params: ListParams) => [...customerGroupKeys.all, params] as const,
  compact: () => [...customerGroupKeys.all, 'compact'] as const,
  detail: (id: string) => [...customerGroupKeys.all, id] as const,
};

export const requestKeys = {
  all: ['requests'] as const,
  lists: () => [...requestKeys.all] as const,
  list: (params: ListParams) => [...requestKeys.all, params] as const,
  detail: (id: string) => [...requestKeys.all, id] as const,
};

export const requestsAllKeys = {
  all: ['requests-all'] as const,
  list: (params: ListParams) => [...requestsAllKeys.all, params] as const,
};

export const lostReasonKeys = {
  all: ['lost-reasons'] as const,
};

// ─── Sales ────────────────────────────────────────────────────────────────

export const quoteKeys = {
  all: ['quotes'] as const,
  lists: () => [...quoteKeys.all] as const,
  list: (params: ListParams) => [...quoteKeys.all, params] as const,
  detail: (id: string) => [...quoteKeys.all, id] as const,
  resolvePrice: (params: ListParams) =>
    [...quoteKeys.all, 'resolve-price', params] as const,
};

export const quoteTemplateKeys = {
  all: ['quote-templates'] as const,
  lists: () => [...quoteTemplateKeys.all] as const,
  list: (params: ListParams) => [...quoteTemplateKeys.all, params] as const,
  detail: (id: string) => [...quoteTemplateKeys.all, id] as const,
  attachments: (templateId: string) =>
    [...quoteTemplateKeys.all, templateId, 'attachments'] as const,
  docxRevisions: (templateId: string) =>
    [...quoteTemplateKeys.all, templateId, 'docx-revisions'] as const,
  followUps: (templateId: string) =>
    [...quoteTemplateKeys.all, templateId, 'follow-ups'] as const,
};

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all] as const,
  list: (params: ListParams) => [...productKeys.all, params] as const,
  detail: (id: string) => [...productKeys.all, id] as const,
};

export const productGroupKeys = {
  all: ['product-groups'] as const,
  lists: () => [...productGroupKeys.all] as const,
  list: (params: ListParams) => [...productGroupKeys.all, params] as const,
  compact: () => [...productGroupKeys.all, 'compact'] as const,
  detail: (id: string) => [...productGroupKeys.all, id] as const,
};

export const priceTableKeys = {
  all: ['price-tables'] as const,
  lists: () => [...priceTableKeys.all] as const,
  list: (params: ListParams) => [...priceTableKeys.all, params] as const,
  detail: (id: string) => [...priceTableKeys.all, id] as const,
  forContact: (contactId: string) =>
    [...priceTableKeys.all, 'for-contact', contactId] as const,
};

// ─── Werk / planning / projecten ────────────────────────────────────────────

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all] as const,
  list: (params: ListParams) => [...taskKeys.all, params] as const,
  detail: (id: string) => [...taskKeys.all, id] as const,
};

export const planningKeys = {
  all: ['planning'] as const,
  lists: () => [...planningKeys.all] as const,
  list: (params: ListParams) => [...planningKeys.all, params] as const,
  detail: (id: string) => [...planningKeys.all, id] as const,
  followers: (id: string) => [...planningKeys.all, id, 'followers'] as const,
  questions: (id: string) => [...planningKeys.all, id, 'questions'] as const,
};

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all] as const,
  list: (params: ListParams) => [...projectKeys.all, params] as const,
  detail: (id: string) => [...projectKeys.all, id] as const,
  locations: (id: string) => [...projectKeys.all, id, 'locations'] as const,
  planning: (id: string) => [...projectKeys.all, id, 'planning'] as const,
  quotes: (id: string) => [...projectKeys.all, id, 'quotes'] as const,
  requests: (id: string) => [...projectKeys.all, id, 'requests'] as const,
  followers: (id: string) => [...projectKeys.all, id, 'followers'] as const,
};

export const projectsAllKeys = {
  all: ['projects-all'] as const,
  list: (params: ListParams) => [...projectsAllKeys.all, params] as const,
};

export const projectPhaseKeys = {
  all: ['project-phases'] as const,
  phases: (projectId: string) => [...projectPhaseKeys.all, projectId] as const,
  milestones: (projectId: string, phaseId: string) =>
    [...projectPhaseKeys.all, projectId, phaseId, 'milestones'] as const,
  followers: (projectId: string, phaseId: string) =>
    [...projectPhaseKeys.all, projectId, phaseId, 'followers'] as const,
};

export const workOrderKeys = {
  all: ['work-orders'] as const,
  lists: () => [...workOrderKeys.all] as const,
  list: (params: ListParams) => [...workOrderKeys.all, params] as const,
  detail: (id: string) => [...workOrderKeys.all, id] as const,
};

// ─── Inspectie-uitvoering ───────────────────────────────────────────────────

export const inspectionPlanKeys = {
  all: ['inspection-plans'] as const,
  lists: () => [...inspectionPlanKeys.all] as const,
  list: (params: ListParams) => [...inspectionPlanKeys.all, params] as const,
  detail: (id: string) => [...inspectionPlanKeys.all, id] as const,
};

export const inspectionAssetKeys = {
  all: ['inspection-assets'] as const,
  byPlan: (planId: string) => [...inspectionAssetKeys.all, planId] as const,
  flat: (planId: string) =>
    [...inspectionAssetKeys.all, planId, 'flat'] as const,
};

export const inspectionDocumentKeys = {
  all: ['inspection-documents'] as const,
  byPlan: (planId: string) => [...inspectionDocumentKeys.all, planId] as const,
};

export const inspectionLocationKeys = {
  all: ['inspection-locations'] as const,
  flat: (planId: string) =>
    [...inspectionLocationKeys.all, planId, 'flat'] as const,
};

export const planTreeKeys = {
  all: ['plan-tree'] as const,
  byPlan: (planId: string) => [...planTreeKeys.all, planId] as const,
};

export const assetKeys = {
  all: ['assets'] as const,
  lists: () => [...assetKeys.all] as const,
  list: (params: ListParams) => [...assetKeys.all, params] as const,
  detail: (id: string) => [...assetKeys.all, id] as const,
};

export const assetFindingKeys = {
  all: ['asset-findings'] as const,
  byAsset: (assetId: string) => [...assetFindingKeys.all, assetId] as const,
};

export const assetTreeKeys = {
  all: ['asset-tree'] as const,
  byLocation: (locationId: string) =>
    [...assetTreeKeys.all, locationId] as const,
};

export const locationImageKeys = {
  all: ['location-image'] as const,
  byLocation: (locationId: string) =>
    [...locationImageKeys.all, locationId] as const,
};

export const standaloneMeasurementKeys = {
  all: ['standalone-measurements'] as const,
  byPlan: (planId: string) => [...standaloneMeasurementKeys.all, planId] as const,
};

export const measurementSheetRecordKeys = {
  all: ['measurement-sheet-records'] as const,
  byAsset: (assetId: string) =>
    [...measurementSheetRecordKeys.all, 'asset', assetId] as const,
  detail: (id: string) => [...measurementSheetRecordKeys.all, id] as const,
};

export const planKeys = {
  all: ['plans'] as const,
  lists: () => [...planKeys.all] as const,
  detail: (id: string) => [...planKeys.all, id] as const,
};

export const inspectionTemplateKeys = {
  all: ['inspection-templates'] as const,
  lists: () => [...inspectionTemplateKeys.all] as const,
  list: (params: ListParams) => [...inspectionTemplateKeys.all, params] as const,
};

/** Enkelvoudig detail-domein voor een inspectie-template (block-editor). */
export const inspectionTemplateKeys1 = {
  all: ['inspection-template'] as const,
  detail: (id: string) => [...inspectionTemplateKeys1.all, id] as const,
};

// ─── Inspectie-configuratie ─────────────────────────────────────────────────

export const assetTypeKeys = {
  all: ['asset-types'] as const,
  lists: () => [...assetTypeKeys.all] as const,
  list: (params: ListParams) => [...assetTypeKeys.all, params] as const,
  detail: (id: string) => [...assetTypeKeys.all, id] as const,
};

export const assetTypeFieldKeys = {
  all: ['asset-type-fields'] as const,
  byType: (id: string) => [...assetTypeFieldKeys.all, id] as const,
};

export const assetTypeConstraintKeys = {
  all: ['asset-type-constraints'] as const,
  byType: (id: string) => [...assetTypeConstraintKeys.all, id] as const,
};

export const locationTypeKeys = {
  all: ['location-types'] as const,
  lists: () => [...locationTypeKeys.all] as const,
  list: (params: ListParams) => [...locationTypeKeys.all, params] as const,
  detail: (id: string) => [...locationTypeKeys.all, id] as const,
};

export const locationTypeFieldKeys = {
  all: ['location-type-fields'] as const,
  byType: (id: string) => [...locationTypeFieldKeys.all, id] as const,
};

export const locationTypeConstraintKeys = {
  all: ['location-type-constraints'] as const,
  byType: (id: string) => [...locationTypeConstraintKeys.all, id] as const,
};

export const checklistKeys = {
  all: ['checklists'] as const,
  lists: () => [...checklistKeys.all] as const,
  list: (params: ListParams) => [...checklistKeys.all, params] as const,
  detail: (id: string) => [...checklistKeys.all, id] as const,
  history: (id: string) => [...checklistKeys.all, id, 'history'] as const,
  preview: (id: string) => [...checklistKeys.all, id, 'preview'] as const,
};

export const checklistItemKeys = {
  all: ['checklist-items'] as const,
  lists: () => [...checklistItemKeys.all] as const,
  list: (params: ListParams) => [...checklistItemKeys.all, params] as const,
  detail: (id: string) => [...checklistItemKeys.all, id] as const,
};

export const classificationModelKeys = {
  all: ['classification-models'] as const,
  lists: () => [...classificationModelKeys.all] as const,
  admin: () => [...classificationModelKeys.all, 'admin'] as const,
  detail: (id: string) => [...classificationModelKeys.all, id] as const,
};

export const normTypeKeys = {
  all: ['norm-types'] as const,
  lists: () => [...normTypeKeys.all] as const,
  list: (params: ListParams) => [...normTypeKeys.all, params] as const,
  detail: (id: string) => [...normTypeKeys.all, id] as const,
};

export const findingTemplateKeys = {
  all: ['finding-templates'] as const,
  lists: () => [...findingTemplateKeys.all] as const,
  list: (params: ListParams) => [...findingTemplateKeys.all, params] as const,
  detail: (id: string) => [...findingTemplateKeys.all, id] as const,
};

export const measurementSheetTemplateKeys = {
  all: ['measurement-sheet-templates'] as const,
  lists: () => [...measurementSheetTemplateKeys.all] as const,
  list: (params: ListParams) =>
    [...measurementSheetTemplateKeys.all, params] as const,
  detail: (id: string) => [...measurementSheetTemplateKeys.all, id] as const,
  history: (id: string) =>
    [...measurementSheetTemplateKeys.all, id, 'history'] as const,
};

export const voiceBasePromptKeys = {
  all: ['voice-base-prompts'] as const,
};

export const voiceTemplatePromptKeys = {
  all: ['voice-template-prompts'] as const,
};

// ─── Organisatie / beheer ───────────────────────────────────────────────────

export const organizationKeys = {
  all: ['organizations'] as const,
  lists: () => [...organizationKeys.all] as const,
  detail: (id: string) => [...organizationKeys.all, id] as const,
  users: (orgId: string) => [...organizationKeys.all, orgId, 'users'] as const,
};

/** Enkelvoudige org-instellingen (huidige tenant). */
export const organizationSettingsKeys = {
  all: ['organization'] as const,
  detail: (orgId: string) => [...organizationSettingsKeys.all, orgId] as const,
};

export const organizationEntitlementKeys = {
  all: ['organization-entitlements'] as const,
  byOrg: (orgId: string) => [...organizationEntitlementKeys.all, orgId] as const,
};

export const orgBrandingKeys = {
  all: ['org-branding'] as const,
  bySlug: (slug: string | null) => [...orgBrandingKeys.all, slug] as const,
};

export const myFeaturesKeys = {
  all: ['my-features'] as const,
  forUser: (userId: string | undefined) =>
    [...myFeaturesKeys.all, userId] as const,
};

export const myActivityKeys = {
  all: ['my-activity'] as const,
  list: (params: ListParams) => [...myActivityKeys.all, params] as const,
};

export const lookupKeys = {
  all: ['lookups'] as const,
  byKind: (kind: string) => [...lookupKeys.all, kind] as const,
};

export const categoryKeys = {
  all: ['categories'] as const,
  list: (params: ListParams) => [...categoryKeys.all, params] as const,
};

export const orgLogoKeys = {
  all: ['org-logo'] as const,
  byOrg: (orgId: string) => [...orgLogoKeys.all, orgId] as const,
};

export const featureCatalogKeys = {
  all: ['feature-catalog'] as const,
};

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all] as const,
  org: () => [...userKeys.all, 'org'] as const,
  selectable: (role: string) => [...userKeys.all, 'selectable', role] as const,
  detail: (id: string) => [...userKeys.all, id] as const,
  recordCounts: (userId: string) =>
    [...userKeys.all, userId, 'record-counts'] as const,
};

export const meKeys = {
  all: ['me'] as const,
};

export const profileKeys = {
  all: ['profile'] as const,
};

export const signatureKeys = {
  all: ['signature'] as const,
};

export const sessionKeys = {
  all: ['sessions'] as const,
};

export const customFieldKeys = {
  all: ['custom-fields'] as const,
  byEntity: (entityType: string) =>
    [...customFieldKeys.all, entityType] as const,
};

export const documentTagKeys = {
  all: ['document-tags'] as const,
  lists: () => [...documentTagKeys.all] as const,
  list: (params: ListParams) => [...documentTagKeys.all, params] as const,
  compact: () => [...documentTagKeys.all, 'compact'] as const,
};

export const numberingSchemeKeys = {
  all: ['numbering-schemes'] as const,
};

export const storageStatsKeys = {
  all: ['storage-stats'] as const,
};

export const supportAccessKeys = {
  all: ['supportAccess'] as const,
  byOrg: (orgId: string) => [...supportAccessKeys.all, orgId] as const,
};

export const supportAccessLogKeys = {
  all: ['supportAccessLogs'] as const,
  byOrg: (orgId: string) => [...supportAccessLogKeys.all, orgId] as const,
};

export const emailTemplateKeys = {
  all: ['email-templates'] as const,
  lists: () => [...emailTemplateKeys.all] as const,
  list: (params: ListParams) => [...emailTemplateKeys.all, params] as const,
  detail: (id: string) => [...emailTemplateKeys.all, id] as const,
  attachments: (templateId: string) =>
    [...emailTemplateKeys.all, templateId, 'attachments'] as const,
};

export const emailTemplateTypeKeys = {
  all: ['email-template-types'] as const,
};

export const measurementInstrumentKeys = {
  all: ['measurement-instruments'] as const,
  lists: () => [...measurementInstrumentKeys.all] as const,
  list: (params: ListParams) =>
    [...measurementInstrumentKeys.all, 'list', params] as const,
  detail: (id: string) =>
    [...measurementInstrumentKeys.all, 'detail', id] as const,
  suggestions: (field: string) =>
    [...measurementInstrumentKeys.all, 'suggestions', field] as const,
};

export const instrumentDefaultKeys = {
  all: ['instrument-defaults'] as const,
  me: () => [...instrumentDefaultKeys.all, 'me'] as const,
  plan: (planId: string) => [...instrumentDefaultKeys.all, 'plan', planId] as const,
};

export const calibrationKeys = {
  all: ['calibrations'] as const,
  byInstrument: (instrumentId: string) =>
    [...calibrationKeys.all, instrumentId] as const,
};

// ─── Beschikbaarheid (PRD-12) ───────────────────────────────────────────────

export const availabilityTemplateKeys = {
  all: ['availability-templates'] as const,
  lists: () => [...availabilityTemplateKeys.all] as const,
  list: (params: ListParams) => [...availabilityTemplateKeys.all, params] as const,
  detail: (id: string) => [...availabilityTemplateKeys.all, id] as const,
};

export const userScheduleKeys = {
  all: ['user-schedules'] as const,
  byUser: (userId: string) => [...userScheduleKeys.all, userId] as const,
};

export const availabilityExceptionKeys = {
  all: ['availability-exceptions'] as const,
  list: (params: ListParams) => [...availabilityExceptionKeys.all, params] as const,
};

export const resolvedAvailabilityKeys = {
  all: ['resolved-availability'] as const,
  range: (params: ListParams) => [...resolvedAvailabilityKeys.all, params] as const,
};

export const availabilityCheckKeys = {
  all: ['availability-check'] as const,
  query: (params: ListParams) => [...availabilityCheckKeys.all, params] as const,
};

export const inspectorCertificateKeys = {
  all: ['inspector-certificates'] as const,
  lists: () => [...inspectorCertificateKeys.all, 'list'] as const,
  list: (userId: string) =>
    [...inspectorCertificateKeys.all, 'list', userId] as const,
  detail: (id: string) =>
    [...inspectorCertificateKeys.all, 'detail', id] as const,
  suggestions: (field: string) =>
    [...inspectorCertificateKeys.all, 'suggestions', field] as const,
};

// ─── Notificaties / documenten / overig ─────────────────────────────────────

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all] as const,
  list: (params: ListParams) => [...notificationKeys.all, params] as const,
  recent: () => [...notificationKeys.all, 'recent'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

export const notificationPrefKeys = {
  all: ['notification-prefs'] as const,
  group: () => [...notificationPrefKeys.all, 'group'] as const,
};

export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all] as const,
  list: (params: ListParams) => [...documentKeys.all, params] as const,
};

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all] as const,
  list: (params: ListParams) => [...noteKeys.all, params] as const,
  byEntity: (entityType: string, entityId: string) =>
    [...noteKeys.all, 'entity', entityType, entityId] as const,
};

export const favoriteKeys = {
  all: ['favorites'] as const,
  keys: () => [...favoriteKeys.all, 'keys'] as const,
  list: (entityType: string) =>
    [...favoriteKeys.all, 'list', entityType] as const,
};

export const helpKeys = {
  all: ['help'] as const,
  categories: () => [...helpKeys.all, 'categories'] as const,
  category: (slug: string) => [...helpKeys.all, 'category', slug] as const,
  articles: (params: ListParams) => [...helpKeys.all, 'articles', params] as const,
  article: (slug: string) => [...helpKeys.all, 'article', slug] as const,
  adminArticles: (params: ListParams) =>
    [...helpKeys.all, 'admin', 'articles', params] as const,
  contextual: (moduleKey: string, q: string) =>
    [...helpKeys.all, 'contextual', moduleKey, q] as const,
};

export const supportTicketKeys = {
  all: ['supportTickets'] as const,
  lists: () => [...supportTicketKeys.all, 'list'] as const,
  list: (params: ListParams) =>
    [...supportTicketKeys.all, 'list', params] as const,
  detail: (id: string) => [...supportTicketKeys.all, 'detail', id] as const,
  stats: () => [...supportTicketKeys.all, 'stats'] as const,
};

export const errorReportKeys = {
  all: ['error-reports'] as const,
  lists: () => [...errorReportKeys.all] as const,
  list: (params: ListParams) => [...errorReportKeys.all, params] as const,
  detail: (id: string) => [...errorReportKeys.all, id] as const,
};

export const chatKeys = {
  all: ['chat'] as const,
  thread: (threadId: string) => [...chatKeys.all, 'thread', threadId] as const,
  threads: () => [...chatKeys.all, 'threads'] as const,
  unread: () => [...chatKeys.all, 'unread'] as const,
  presence: () => [...chatKeys.all, 'presence'] as const,
  users: (q: string) => [...chatKeys.all, 'users', q] as const,
};

export const documentTemplateKeys = {
  all: ['document-template'] as const,
  detail: (inspectionTemplateId: string, type: string) =>
    [...documentTemplateKeys.all, inspectionTemplateId, type] as const,
};

export const scopeLocationKeys = {
  all: ['scope-locations'] as const,
  byPlan: (planId: string) => [...scopeLocationKeys.all, planId] as const,
};

export const searchKeys = {
  all: ['search'] as const,
  query: (params: ListParams) => [...searchKeys.all, params] as const,
};

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  byEntity: (entityType: string, entityId: string) =>
    [...auditLogKeys.all, entityType, entityId] as const,
  list: (entityType: string, entityId: string | undefined, params: ListParams) =>
    [...auditLogKeys.all, entityType, entityId, params] as const,
};
