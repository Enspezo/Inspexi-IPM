// Online herstel van constateringen (PRD-14) — gedeelde constanten.
import type { FeatureKey } from '@inspexi/entitlements';

export const ONLINE_HERSTEL_FEATURE: FeatureKey = 'ONLINE_HERSTEL';

/**
 * Anti-enumeratie (PRD-14 besluit 11): de anonieme lookup geeft ALTIJD deze
 * generieke melding — of het rapportnummer nu niet bestaat, de postcode fout is,
 * de plan-vlag uit staat of de org het entitlement mist.
 */
export const REPAIR_LOOKUP_GENERIC_ERROR =
  'Deze combinatie is niet gevonden of online herstel is niet beschikbaar voor deze inspectie';

export const REPAIR_SESSION_EXPIRED_ERROR =
  'Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode.';

export const REPAIR_CONFLICT_ERROR =
  'Deze constatering is zojuist al door een andere partij hersteld gemeld. Uw invoer is bewaard en de projectmanager is geïnformeerd.';

/** Resolutie-statuscodes van de herstel-flow (→ imp_resolution_status_types.code). */
export const RESOLUTION_REPORTED = 'REPORTED';
export const RESOLUTION_CONFLICT = 'CONFLICT';

/** Sessieduur: 72 uur (PRD-14 §14.11). */
export const REPAIR_SESSION_TTL_MS = 72 * 60 * 60 * 1000;
