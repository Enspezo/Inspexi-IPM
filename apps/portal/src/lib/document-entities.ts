import { DocumentEntityType } from '@/types';

/**
 * Single source of truth for how `DocumentEntityType` link types are presented
 * in the staff portal. Shared between the upload modal (record picker) and the
 * documents overview filter so the two never drift apart.
 */
export const DOCUMENT_ENTITY_LABELS: Record<DocumentEntityType, string> = {
  [DocumentEntityType.CONTACT]: 'Relatie',
  [DocumentEntityType.LOCATION]: 'Locatie',
  [DocumentEntityType.REQUEST]: 'Aanvraag',
  [DocumentEntityType.QUOTE]: 'Offerte',
  [DocumentEntityType.PROJECT]: 'Project',
  [DocumentEntityType.TASK]: 'Taak',
  [DocumentEntityType.PRODUCT]: 'Product',
  [DocumentEntityType.PLANNING]: 'Afspraak',
  [DocumentEntityType.WORK_ORDER]: 'Werkbon',
  [DocumentEntityType.USER]: 'Gebruiker',
};

/**
 * Order in which link types are offered when manually linking a document.
 * Every entity type supports a manual link, so all are listed.
 */
export const DOCUMENT_ENTITY_LINK_TYPES: DocumentEntityType[] = [
  DocumentEntityType.CONTACT,
  DocumentEntityType.LOCATION,
  DocumentEntityType.REQUEST,
  DocumentEntityType.QUOTE,
  DocumentEntityType.PROJECT,
  DocumentEntityType.TASK,
  DocumentEntityType.PRODUCT,
  DocumentEntityType.PLANNING,
  DocumentEntityType.WORK_ORDER,
  DocumentEntityType.USER,
];

/**
 * Detail-page routes per entity type, used to deep-link from a document to the
 * entity it is attached to. Types without a stand-alone detail route are omitted.
 */
export const DOCUMENT_ENTITY_ROUTES: Partial<Record<DocumentEntityType, string>> = {
  [DocumentEntityType.CONTACT]: '/contacts',
  [DocumentEntityType.LOCATION]: '/contacts/locations',
  [DocumentEntityType.REQUEST]: '/requests',
  [DocumentEntityType.QUOTE]: '/quotes',
  [DocumentEntityType.PROJECT]: '/projects',
  [DocumentEntityType.TASK]: '/tasks',
  [DocumentEntityType.PRODUCT]: '/products',
  [DocumentEntityType.PLANNING]: '/planning',
  [DocumentEntityType.WORK_ORDER]: '/work-orders',
  [DocumentEntityType.USER]: '/users',
};

export function getDocumentEntityLabel(type: DocumentEntityType): string {
  return DOCUMENT_ENTITY_LABELS[type] ?? type;
}
