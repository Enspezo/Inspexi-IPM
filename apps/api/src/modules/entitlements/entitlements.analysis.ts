/**
 * Pure (DI-vrije) entitlement-resolutie + dependency-analyse (PRD-09 §4.3 / §5.3).
 *
 * Hier leeft de wiskunde van de effectieve feature-set, los van Prisma/Nest zodat
 * de {@link EntitlementsService} (gecachet, met I/O) én de SUPERUSER-beheer-laag
 * (Plan-CRUD, per-org overrides) dezelfde logica delen en hij geïsoleerd te
 * unit-testen is. De portal spiegelt dit in `apps/portal/src/lib/entitlements.ts`
 * voor live UI-waarschuwingen.
 */

import {
  FEATURE_CATALOG,
  FEATURE_KEYS,
  FeatureKey,
  isFeatureKey,
} from './feature-catalog';

export interface FeatureOverrideInput {
  featureKey: string;
  enabled: boolean;
}

/** Een afhankelijkheid die een afschakel-override neutraliseert (closure wint). */
export interface EntitlementWarning {
  /** De feature die de SUPERUSER probeerde af te schakelen. */
  featureKey: FeatureKey;
  /** Effectieve features die ervan afhangen en hem daarom aan houden. */
  requiredBy: FeatureKey[];
}

export interface EntitlementAnalysis {
  /** Effectieve feature-keys (plan ⊕ overrides ⊕ closure), geordend volgens FEATURE_KEYS. */
  effective: FeatureKey[];
  /** Afschakel-overrides die door de dependency-closure ongedaan worden gemaakt. */
  warnings: EntitlementWarning[];
}

/**
 * Basis-set vóór dependency-closure: plan-defaults ⊕ bijschakel-overrides \
 * afschakel-overrides. Onbekende keys (stale DB-rijen) worden genegeerd.
 */
function buildBaseSet(
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): Set<FeatureKey> {
  const set = new Set<FeatureKey>();
  for (const key of planKeys) {
    if (isFeatureKey(key)) set.add(key);
  }
  for (const { featureKey, enabled } of overrides) {
    if (!isFeatureKey(featureKey)) continue;
    if (enabled) set.add(featureKey);
    else set.delete(featureKey);
  }
  return set;
}

/** Voegt voor elke feature in de set zijn (transitieve) dependsOn toe (in place). */
function expandDependencies(set: Set<FeatureKey>): void {
  const queue: FeatureKey[] = [...set];
  while (queue.length > 0) {
    const key = queue.pop()!;
    for (const dep of FEATURE_CATALOG[key].dependsOn) {
      if (!set.has(dep)) {
        set.add(dep);
        queue.push(dep);
      }
    }
  }
}

/** Transitieve dependsOn-verzameling van één feature (excl. zichzelf). */
function transitiveDeps(key: FeatureKey): Set<FeatureKey> {
  const deps = new Set<FeatureKey>();
  const queue = [...FEATURE_CATALOG[key].dependsOn];
  while (queue.length > 0) {
    const dep = queue.pop()!;
    if (!deps.has(dep)) {
      deps.add(dep);
      queue.push(...FEATURE_CATALOG[dep].dependsOn);
    }
  }
  return deps;
}

/**
 * Effectieve feature-keys: plan-defaults ⊕ overrides ⊕ transitieve closure.
 * De closure draait NÁ de afschakel-overrides en wint daarvan.
 */
export function resolveEffectiveFeatures(
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): FeatureKey[] {
  const set = buildBaseSet(planKeys, overrides);
  expandDependencies(set);
  return FEATURE_KEYS.filter((key) => set.has(key));
}

/**
 * Berekent de effectieve set én welke afschakel-overrides door de closure worden
 * teruggedraaid (bijv. `BASIS_CRM` afschakelen terwijl `BASIS_INSPECTIES` aanstaat).
 * Voedt zowel de API-respons (`GET /organizations/:id/entitlements`) als de
 * UI-waarschuwing.
 */
export function analyzeEntitlements(
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): EntitlementAnalysis {
  const effectiveSet = buildBaseSet(planKeys, overrides);
  expandDependencies(effectiveSet);

  const warnings: EntitlementWarning[] = [];
  for (const { featureKey, enabled } of overrides) {
    // Alleen afschakel-overrides die tóch effectief blijven, zijn een conflict.
    if (enabled || !isFeatureKey(featureKey)) continue;
    if (!effectiveSet.has(featureKey)) continue;

    const requiredBy = FEATURE_KEYS.filter(
      (other) =>
        other !== featureKey &&
        effectiveSet.has(other) &&
        transitiveDeps(other).has(featureKey),
    );
    // Effectief ondanks afschakeling, maar niets hangt ervan af → kan niet, maar
    // defensief: alleen melden als er daadwerkelijk een afhankelijke is.
    if (requiredBy.length > 0) {
      warnings.push({ featureKey, requiredBy });
    }
  }

  return {
    effective: FEATURE_KEYS.filter((key) => effectiveSet.has(key)),
    warnings,
  };
}
