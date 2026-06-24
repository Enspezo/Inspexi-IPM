// Re-export van het gedeelde workspace-pakket @inspexi/entitlements — de
// bron-van-waarheid voor de SaaS-feature-keys (gedeeld met de backend). Het
// klantportaal draait volledig op één feature (BASIS_INSPECTIES, PRD §2.2), maar
// houdt de volledige, type-veilige key-lijst aan. Dit dunne bestand houdt het
// bestaande importpad (`@/lib/features`) intact.
export { FEATURE_KEYS } from '@inspexi/entitlements';
export type { FeatureKey } from '@inspexi/entitlements';
