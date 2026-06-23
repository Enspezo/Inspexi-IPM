// Frontend-spiegel van de backend feature-catalogus
// (apps/api/src/modules/entitlements/feature-catalog.ts). Het klantportaal draait
// volledig op één feature (BASIS_INSPECTIES, PRD §2.2), maar we houden de volledige
// key-lijst aan voor een type-veilige, herbruikbare gating-laag.
export const FEATURE_KEYS = [
  'BASIS_CRM',
  'CRM_COMPLEET',
  'BASIS_UITVOERING',
  'UITVOERING_COMPLEET',
  'BASIS_INSPECTIES',
  'BASIS_WORKFLOW',
  'WORKFLOW_COMPLEET',
  'WEBHOOKS',
  'CUSTOM_FIELDS',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
