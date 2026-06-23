// Frontend-spiegel van de backend feature-catalogus
// (apps/api/src/modules/entitlements/feature-catalog.ts). De keys zijn de
// bron-van-waarheid voor de SaaS-entitlements; deze lijst houdt de portal-gating
// type-veilig zonder een runtime-afhankelijkheid op de API-package.
export const FEATURE_KEYS = [
  'BASIS_CRM',
  'CRM_COMPLEET',
  'BASIS_UITVOERING',
  'UITVOERING_COMPLEET',
  'BASIS_INSPECTIES',
  'BASIS_WORKFLOW',
  'WORKFLOW_COMPLEET',
  // Add-ons (standaard bij Compleet; voor Basis-orgs los per org bij te schakelen)
  'WEBHOOKS',
  'CUSTOM_FIELDS',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
