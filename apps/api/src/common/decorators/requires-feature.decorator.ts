import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '@inspexi/entitlements';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';
export const ALLOW_DOWNGRADED_EXPORT_KEY = 'allowDowngradedExport';

/**
 * Markeert een controller (of losse handler) als gegate achter één of meer
 * feature-keys (PRD-09 §5.1). De globale {@link FeatureGuard} (geregistreerd ná
 * de TenantGuard) controleert of de effectieve feature-set van de organisatie
 * ALLE opgegeven keys bevat; zo niet → `403 FEATURE_NOT_IN_PLAN`.
 *
 * - Eén of meer keys: `@RequiresFeature('CRM_COMPLEET')` of
 *   `@RequiresFeature('BASIS_CRM', 'CRM_COMPLEET')` (AND-semantiek: alle keys
 *   moeten aanstaan).
 * - SUPERUSER omzeilt de check altijd (heeft impliciet alle features).
 * - Core/platform-controllers krijgen GEEN `@RequiresFeature` — die zijn altijd
 *   toegankelijk en worden nooit gegate (auth, users, organizations, search,
 *   vat, numbering, e-mailsjablonen, notificatie-dispatch, …).
 */
export const RequiresFeature = (...features: FeatureKey[]) =>
  SetMetadata(REQUIRES_FEATURE_KEY, features);

/**
 * Downgrade-/retentie-pad (PRD-09 §5.4): markeert een read/export-route die de
 * feature-check van de {@link FeatureGuard} OVERSLAAT, zodat een afgeschakelde
 * organisatie haar data nog kan inzien/exporteren. Toegang blijft beperkt tot
 * SUPERUSER (of — toekomstig — expliciete org-toestemming) en wordt ALTIJD
 * ge-audit-logd. Alleen bedoeld voor read/export-endpoints, nooit voor schrijf.
 */
export const AllowDowngradedExport = () =>
  SetMetadata(ALLOW_DOWNGRADED_EXPORT_KEY, true);
