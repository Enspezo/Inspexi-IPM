/**
 * Vaste enum → presentatie-mappings voor het klantportaal. ALLEEN de lifecycle-ENUMs die geen
 * lookup zijn: document-status (GeneratedDocumentStatus) en handtekening-status (SignatureStatus).
 * Status/type-velden die LOOKUPS zijn (plan/asset/finding/resolution/request, inspection-/signer-
 * types) renderen via <LookupBadge> (lib/lookups.ts), NIET hier.
 */
export interface StatusConfig {
  label: string;
  classes: string;
}

export type StatusMap = Record<string, StatusConfig>;

const FALLBACK: StatusConfig = { label: '', classes: 'bg-gray-100 text-gray-600' };

/** Veilige lookup: onbekende waarde → grijze badge met de ruwe waarde als label. */
export function getStatusConfig(map: StatusMap, value: string | null | undefined): StatusConfig {
  if (!value) return { ...FALLBACK, label: '—' };
  return map[value] ?? { ...FALLBACK, label: value };
}

export const GENERATED_DOCUMENT_STATUS: StatusMap = {
  DRAFT: { label: 'Concept', classes: 'bg-gray-100 text-gray-700' },
  PENDING_SIGNATURES: { label: 'Wacht op ondertekening', classes: 'bg-orange-100 text-orange-800' },
  SIGNED: { label: 'Ondertekend', classes: 'bg-green-100 text-green-800' },
  FINALIZED: { label: 'Definitief', classes: 'bg-green-100 text-green-800' },
};

export const SIGNATURE_STATUS: StatusMap = {
  PENDING: { label: 'In afwachting', classes: 'bg-gray-100 text-gray-700' },
  REQUESTED: { label: 'Verzonden', classes: 'bg-blue-100 text-blue-800' },
  SIGNED: { label: 'Ondertekend', classes: 'bg-green-100 text-green-800' },
  DECLINED: { label: 'Geweigerd', classes: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Verlopen', classes: 'bg-red-100 text-red-800' },
};
