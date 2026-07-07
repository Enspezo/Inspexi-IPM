/**
 * Vaste enum → presentatie-mappings voor het klantportaal. ALLEEN de lifecycle-ENUMs die geen
 * lookup zijn: document-status (GeneratedDocumentStatus) en handtekening-status (SignatureStatus).
 * Status/type-velden die LOOKUPS zijn (plan/asset/finding/resolution/request, inspection-/signer-
 * types) renderen via <LookupBadge> (lib/lookups.ts), NIET hier.
 *
 * Deze maps + het StatusConfig/StatusMap-type + getStatusConfig komen uit
 * @inspexi/shared-web (identiek gedeeld met de Beheer-portal); hier alleen re-export
 * zodat bestaande `@/lib/status`-imports blijven werken.
 */
export type { StatusConfig, StatusMap } from '@inspexi/shared-web';
export {
  getStatusConfig,
  GENERATED_DOCUMENT_STATUS,
  SIGNATURE_STATUS,
} from '@inspexi/shared-web';
