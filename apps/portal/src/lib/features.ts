// Re-export van het gedeelde workspace-pakket @inspexi/entitlements — de
// bron-van-waarheid voor de SaaS-feature-keys (gedeeld met de backend). Dit dunne
// bestand houdt de bestaande portal-importpaden (`@/lib/features`) intact.
export { FEATURE_KEYS } from '@inspexi/entitlements';
export type { FeatureKey } from '@inspexi/entitlements';
