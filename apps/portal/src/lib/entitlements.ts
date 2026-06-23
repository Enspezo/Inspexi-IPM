// SaaS-entitlements types + dependency-analyse voor de SUPERUSER-beheer-UI
// (PRD-09 §5.3). Spiegelt de backend `entitlements.analysis.ts` zodat de UI live
// de effectieve set + dependency-waarschuwingen kan tonen vóór het opslaan.
import type { FeatureKey } from './features';

/** Feature-definitie zoals geleverd door `GET /admin/features`. */
export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  dependsOn: FeatureKey[];
}

/** Tri-state per-org override (matcht de backend `OrganizationFeatureState`). */
export type FeatureOverrideState = 'PLAN' | 'ENABLED' | 'DISABLED';

export interface FeatureOverride {
  featureKey: string;
  enabled: boolean;
  updatedAt?: string;
}

export interface EntitlementWarning {
  featureKey: string;
  requiredBy: string[];
}

/** Respons van `GET /organizations/:id/entitlements`. */
export interface OrganizationEntitlements {
  planId: string | null;
  plan: { id: string; name: string; slug: string } | null;
  planFeatureKeys: string[];
  overrides: FeatureOverride[];
  effective: string[];
  warnings: EntitlementWarning[];
}

/** Abonnementsplan zoals geleverd door `GET /plans`. */
export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  features: { featureKey: string }[];
  _count?: { organizations: number };
}

interface OverrideInput {
  featureKey: string;
  enabled: boolean;
}

function catalogMap(catalog: FeatureDef[]): Map<string, FeatureDef> {
  return new Map(catalog.map((f) => [f.key, f]));
}

/** Basis-set: plan ⊕ bijschakel-overrides \ afschakel-overrides (zonder closure). */
function buildBaseSet(
  catalog: Map<string, FeatureDef>,
  planKeys: string[],
  overrides: OverrideInput[],
): Set<string> {
  const set = new Set<string>();
  for (const key of planKeys) if (catalog.has(key)) set.add(key);
  for (const { featureKey, enabled } of overrides) {
    if (!catalog.has(featureKey)) continue;
    if (enabled) set.add(featureKey);
    else set.delete(featureKey);
  }
  return set;
}

function expandDependencies(catalog: Map<string, FeatureDef>, set: Set<string>): void {
  const queue = [...set];
  while (queue.length > 0) {
    const key = queue.pop()!;
    for (const dep of catalog.get(key)?.dependsOn ?? []) {
      if (!set.has(dep)) {
        set.add(dep);
        queue.push(dep);
      }
    }
  }
}

function transitiveDeps(catalog: Map<string, FeatureDef>, key: string): Set<string> {
  const deps = new Set<string>();
  const queue = [...(catalog.get(key)?.dependsOn ?? [])];
  while (queue.length > 0) {
    const dep = queue.pop()!;
    if (!deps.has(dep)) {
      deps.add(dep);
      queue.push(...(catalog.get(dep)?.dependsOn ?? []));
    }
  }
  return deps;
}

/**
 * Berekent de effectieve set (plan ⊕ overrides ⊕ closure) en de waarschuwingen
 * voor afschakel-overrides die de closure terugdraait — identiek aan de backend.
 * `catalog` bepaalt de volgorde van de output.
 */
export function analyzeEntitlements(
  catalog: FeatureDef[],
  planKeys: string[],
  overrides: OverrideInput[],
): { effective: string[]; warnings: EntitlementWarning[] } {
  const map = catalogMap(catalog);
  const effectiveSet = buildBaseSet(map, planKeys, overrides);
  expandDependencies(map, effectiveSet);

  const warnings: EntitlementWarning[] = [];
  for (const { featureKey, enabled } of overrides) {
    if (enabled || !map.has(featureKey) || !effectiveSet.has(featureKey)) continue;
    const requiredBy = catalog
      .map((f) => f.key)
      .filter(
        (other) =>
          other !== featureKey &&
          effectiveSet.has(other) &&
          transitiveDeps(map, other).has(featureKey),
      );
    if (requiredBy.length > 0) warnings.push({ featureKey, requiredBy });
  }

  return {
    effective: catalog.map((f) => f.key).filter((k) => effectiveSet.has(k)),
    warnings,
  };
}

/**
 * Sluiting van een verzameling geselecteerde plan-features: welke extra features
 * worden automatisch mee-geactiveerd door de dependency-closure. Voedt de hint
 * "X wordt automatisch geactiveerd" in de plan-editor.
 */
export function forcedDependencies(
  catalog: FeatureDef[],
  selectedKeys: string[],
): Set<string> {
  const map = catalogMap(catalog);
  const full = new Set(selectedKeys.filter((k) => map.has(k)));
  expandDependencies(map, full);
  const forced = new Set<string>();
  for (const k of full) if (!selectedKeys.includes(k)) forced.add(k);
  return forced;
}

/** Huidige override-staat van één feature (PLAN = volgt het plan). */
export function overrideStateFor(
  featureKey: string,
  overrides: FeatureOverride[],
): FeatureOverrideState {
  const o = overrides.find((x) => x.featureKey === featureKey);
  if (!o) return 'PLAN';
  return o.enabled ? 'ENABLED' : 'DISABLED';
}
