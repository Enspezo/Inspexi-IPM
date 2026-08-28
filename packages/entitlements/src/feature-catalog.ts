/**
 * Feature-catalogus — bron-van-waarheid voor de entitlements-laag (PRD §4.1).
 *
 * De keys hieronder zijn de canonieke feature-identifiers (in code en in de
 * database via `PlanFeature.featureKey` / `OrganizationFeature.featureKey`).
 * De database slaat alleen *plannen* (templates) en *per-org-overrides* op die
 * naar deze keys verwijzen; de catalogus zelf is versiebeheerd en niet door
 * gebruikers wijzigbaar.
 *
 * Core-functies (auth, profiel, organisatie-instellingen, gebruikers, zoeken,
 * dashboard, e-mailsjablonen, notificatie-dispatch) en platform-functies
 * (organisaties, foutmeldingen, inspectie-systeem — alleen SUPERUSER) staan
 * bewust NIET in de catalogus: die zijn altijd aan en worden nooit gegate.
 *
 * Dit is het gedeelde workspace-pakket `@inspexi/entitlements`: backend (resolver,
 * guard, plan-CRUD), portal en client-portal consumeren hetzelfde bestand zodat
 * er één bron-van-waarheid is (PRD-09 refactor — geen 3-4× duplicaat meer).
 */

export const FEATURE_KEYS = [
  'BASIS_CRM',
  'CRM_COMPLEET',
  'BASIS_UITVOERING',
  'UITVOERING_COMPLEET',
  'BASIS_INSPECTIES',
  'BASIS_WORKFLOW',
  'WORKFLOW_COMPLEET',
  // Add-ons (standaard bij Compleet; voor Basis-orgs los per org bij te schakelen)
  'PROJECT_FASEN',
  'WEBHOOKS',
  'CUSTOM_FIELDS',
  'AI_REVIEW',
  'ONLINE_HERSTEL',
  'AI_AGENT',
  'URENREGISTRATIE',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureDef {
  key: FeatureKey;
  /** NL-label, voor de SUPERUSER-beheer-UI. */
  label: string;
  description: string;
  /** Automatische afhankelijkheden (transitieve dependency-closure). */
  dependsOn: FeatureKey[];
}

export const FEATURE_CATALOG: Record<FeatureKey, FeatureDef> = {
  BASIS_CRM: {
    key: 'BASIS_CRM',
    label: 'Basis CRM',
    description: 'Relaties, contactpersonen, locaties',
    dependsOn: [],
  },
  CRM_COMPLEET: {
    key: 'CRM_COMPLEET',
    label: 'CRM Compleet',
    description: 'Aanvragen, offertes, klantgroepen, producten & prijstabellen',
    dependsOn: ['BASIS_CRM'],
  },
  BASIS_UITVOERING: {
    key: 'BASIS_UITVOERING',
    label: 'Basis Uitvoering',
    description: 'Projecten incl. volgers',
    dependsOn: ['BASIS_CRM'],
  },
  UITVOERING_COMPLEET: {
    key: 'UITVOERING_COMPLEET',
    label: 'Uitvoering Compleet',
    description: 'Planning + werkbonnen',
    dependsOn: ['BASIS_UITVOERING'],
  },
  BASIS_INSPECTIES: {
    key: 'BASIS_INSPECTIES',
    label: 'Basis Inspecties',
    description: 'Inspecties, assets, PWA, rapportage, klantportaal',
    dependsOn: ['BASIS_CRM'],
  },
  BASIS_WORKFLOW: {
    key: 'BASIS_WORKFLOW',
    label: 'Basis Workflow',
    description: 'Notities, favorieten, notificaties, taken',
    dependsOn: [],
  },
  WORKFLOW_COMPLEET: {
    key: 'WORKFLOW_COMPLEET',
    label: 'Workflow Compleet',
    description: 'Documenten (DMS) + audit trail',
    dependsOn: ['BASIS_WORKFLOW'],
  },
  // Add-ons — standaard bij Compleet; voor Basis-orgs los per org bij te schakelen.
  PROJECT_FASEN: {
    key: 'PROJECT_FASEN',
    label: 'Projectfasen',
    description:
      'Deelprojecten (fasen) binnen een project: milestones, fasevolgers en voorbereiding voor deelfacturatie',
    dependsOn: ['BASIS_UITVOERING'],
  },
  WEBHOOKS: {
    key: 'WEBHOOKS',
    label: 'Webhooks (add-on)',
    description: 'Uitgaande integraties / webhooks',
    dependsOn: [],
  },
  CUSTOM_FIELDS: {
    key: 'CUSTOM_FIELDS',
    label: 'Aangepaste velden (add-on)',
    description: 'Custom-field-definities op entiteiten',
    dependsOn: [],
  },
  AI_REVIEW: {
    key: 'AI_REVIEW',
    label: 'AI-rapportcontrole (add-on)',
    description: 'AI-voorcontrole van inspectierapporten vóór de menselijke review',
    dependsOn: ['BASIS_INSPECTIES'],
  },
  ONLINE_HERSTEL: {
    key: 'ONLINE_HERSTEL',
    label: 'Online herstel (add-on)',
    description:
      'Externen en klanten melden herstel van constateringen online, incl. ondertekende herstelverklaring',
    dependsOn: ['BASIS_INSPECTIES'],
  },
  // AI-assistent (betaalde add-on). Minimaal Basis CRM als domein-basis.
  AI_AGENT: {
    key: 'AI_AGENT',
    label: 'AI-assistent (add-on)',
    description:
      'AI-agent in de portal voor backoffice-werk (opzoeken, KVK/PDOK, web-search, muteren met bevestiging)',
    dependsOn: ['BASIS_CRM'],
  },
  // Urenregistratie & reistijd (betaalde add-on, PRD-16). Urenregels koppelen
  // aan projecten, dus Basis Uitvoering is de domein-basis.
  URENREGISTRATIE: {
    key: 'URENREGISTRATIE',
    label: 'Urenregistratie & reistijd (add-on)',
    description:
      'Urenstaat voor inspecteurs (PWA-timers, weekstaten met goedkeuring) incl. automatische reistijd en locatie tijdens het reizen',
    dependsOn: ['BASIS_UITVOERING'],
  },
};

/**
 * Catalogus als array, geordend volgens FEATURE_KEYS. Voedt de array-gedreven
 * resolver/analyse (`*With`-functies + de static convenience-wrappers) en is
 * exact wat `GET /admin/features` aan de portal levert.
 */
export const FEATURE_CATALOG_LIST: FeatureDef[] = FEATURE_KEYS.map(
  (key) => FEATURE_CATALOG[key],
);

/** Type-guard: is een willekeurige string een bekende feature-key? */
export function isFeatureKey(value: string): value is FeatureKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_CATALOG, value);
}
