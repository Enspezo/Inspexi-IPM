/**
 * Gecentraliseerde TanStack Query key-factories voor het klantportaal.
 *
 * Zelfde conventie als in de staf-portal (`apps/portal/src/lib/query-keys.ts`):
 * hooks bouwen hun `queryKey` én hun `invalidateQueries` uitsluitend hiermee,
 * zodat losse string-arrays niet meer uit de pas kunnen lopen. De array-vormen
 * zijn identiek aan de historische keys (gedrags-neutrale migratie).
 */

type ListParams = unknown;

export const clientDashboardKeys = {
  all: ['client-dashboard'] as const,
};

export const clientMeKeys = {
  all: ['client-me'] as const,
};

export const clientInspectionKeys = {
  all: ['client-inspections'] as const,
  lists: () => [...clientInspectionKeys.all] as const,
  list: (params: ListParams) => [...clientInspectionKeys.all, params] as const,
};

/** Enkelvoudige inspectie-detail in het klantportaal. */
export const clientInspectionDetailKeys = {
  all: ['client-inspection'] as const,
  detail: (id: string) => [...clientInspectionDetailKeys.all, id] as const,
};

export const clientInspectionDocumentKeys = {
  all: ['client-inspection-documents'] as const,
  byInspection: (id: string) =>
    [...clientInspectionDocumentKeys.all, id] as const,
};

export const clientInspectionFindingKeys = {
  all: ['client-inspection-findings'] as const,
  byInspection: (id: string) =>
    [...clientInspectionFindingKeys.all, id] as const,
};

export const clientDocumentKeys = {
  all: ['client-document'] as const,
  detail: (id: string) => [...clientDocumentKeys.all, id] as const,
};

export const clientFindingKeys = {
  all: ['client-finding'] as const,
  detail: (id: string) => [...clientFindingKeys.all, id] as const,
};

export const clientMessageKeys = {
  all: ['client-messages'] as const,
  byInspection: (inspectionId: string) =>
    [...clientMessageKeys.all, inspectionId] as const,
};

/**
 * Herstelsessie (PRD-14, online herstel). Eén actieve sessie per tab — de key is
 * daarom niet geparametriseerd; een nieuwe lookup/sessiestart vervangt de cache.
 */
export const repairSessionKeys = {
  all: ['repair-session'] as const,
};

export const clientRequestKeys = {
  all: ['client-requests'] as const,
  lists: () => [...clientRequestKeys.all] as const,
};

/** Enkelvoudig aanvraag-detail in het klantportaal. */
export const clientRequestDetailKeys = {
  all: ['client-request'] as const,
  detail: (id: string) => [...clientRequestDetailKeys.all, id] as const,
};
