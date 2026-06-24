/**
 * Pure (DI-vrije) entitlement-resolutie + dependency-analyse (PRD-09 §4.3 / §5.3).
 *
 * Hier leeft de wiskunde van de effectieve feature-set, los van Prisma/Nest/React.
 * Eén implementatie, gedeeld door:
 *   - de backend-resolver ({@link resolveEffectiveFeatures}, gecachet, met Prisma-I/O),
 *   - de SUPERUSER-beheer-laag (Plan-CRUD, per-org overrides, {@link analyzeEntitlements}),
 *   - de portal-UI (live waarschuwingen + "wordt automatisch geactiveerd"-hints).
 *
 * De *With-functies zijn catalogus-geparametriseerd: ze werken op een meegegeven
 * `FeatureDef[]`. Dat is wat de portal nodig heeft (hij gebruikt de via
 * `GET /admin/features` opgehaalde catalogus). De backend werkt altijd met de
 * volledige ingebouwde catalogus en gebruikt daarom de 2-arg convenience-wrappers
 * onderaan (gebonden aan {@link FEATURE_CATALOG_LIST}).
 */

import {
  FEATURE_CATALOG_LIST,
  FeatureDef,
  FeatureKey,
} from './feature-catalog';

export interface FeatureOverrideInput {
  featureKey: string;
  enabled: boolean;
}

/**
 * Tri-state per-org feature-override (PRD-09 §5.3):
 * - `PLAN`     → verwijder de override; volg de plan-default.
 * - `ENABLED`  → bijschakelen bovenop het plan.
 * - `DISABLED` → afschakelen (let op: de dependency-closure kan dit terugdraaien).
 *
 * Eén gedeelde definitie: de backend-DTO (`@IsEnum`) én de portal-UI hangen
 * hieraan, zodat backend-validatie en frontend-keuze niet kunnen driften.
 */
export enum FeatureOverrideState {
  PLAN = 'PLAN',
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
}

/** Een afhankelijkheid die een afschakel-override neutraliseert (closure wint). */
export interface EntitlementWarning {
  /** De feature die de SUPERUSER probeerde af te schakelen. */
  featureKey: FeatureKey;
  /** Effectieve features die ervan afhangen en hem daarom aan houden. */
  requiredBy: FeatureKey[];
}

export interface EntitlementAnalysis {
  /** Effectieve feature-keys (plan ⊕ overrides ⊕ closure), geordend volgens de catalogus. */
  effective: FeatureKey[];
  /** Afschakel-overrides die door de dependency-closure ongedaan worden gemaakt. */
  warnings: EntitlementWarning[];
}

/** Index een catalogus (FeatureDef[]) op key voor O(1) dependency-lookups. */
function catalogMap(catalog: FeatureDef[]): Map<string, FeatureDef> {
  return new Map(catalog.map((f) => [f.key, f]));
}

/**
 * Basis-set vóór dependency-closure: plan-defaults ⊕ bijschakel-overrides \
 * afschakel-overrides. Keys buiten de meegegeven catalogus (stale DB-rijen)
 * worden genegeerd.
 */
function buildBaseSet(
  map: Map<string, FeatureDef>,
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): Set<FeatureKey> {
  const set = new Set<FeatureKey>();
  for (const key of planKeys) {
    if (map.has(key)) set.add(key as FeatureKey);
  }
  for (const { featureKey, enabled } of overrides) {
    if (!map.has(featureKey)) continue;
    if (enabled) set.add(featureKey as FeatureKey);
    else set.delete(featureKey as FeatureKey);
  }
  return set;
}

/** Voegt voor elke feature in de set zijn (transitieve) dependsOn toe (in place). */
function expandDependencies(
  map: Map<string, FeatureDef>,
  set: Set<FeatureKey>,
): void {
  const queue: FeatureKey[] = [...set];
  while (queue.length > 0) {
    const key = queue.pop()!;
    for (const dep of map.get(key)?.dependsOn ?? []) {
      if (!set.has(dep)) {
        set.add(dep);
        queue.push(dep);
      }
    }
  }
}

/** Transitieve dependsOn-verzameling van één feature (excl. zichzelf). */
function transitiveDeps(
  map: Map<string, FeatureDef>,
  key: FeatureKey,
): Set<FeatureKey> {
  const deps = new Set<FeatureKey>();
  const queue: FeatureKey[] = [...(map.get(key)?.dependsOn ?? [])];
  while (queue.length > 0) {
    const dep = queue.pop()!;
    if (!deps.has(dep)) {
      deps.add(dep);
      queue.push(...(map.get(dep)?.dependsOn ?? []));
    }
  }
  return deps;
}

/**
 * Effectieve feature-keys: plan-defaults ⊕ overrides ⊕ transitieve closure,
 * geordend volgens de meegegeven catalogus. De closure draait NÁ de
 * afschakel-overrides en wint daarvan — `BASIS_CRM` kan niet afgeschakeld worden
 * zolang `BASIS_INSPECTIES`/`BASIS_UITVOERING` aanstaan (die hangen ervan af).
 */
export function resolveEffectiveFeaturesWith(
  catalog: FeatureDef[],
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): FeatureKey[] {
  const map = catalogMap(catalog);
  const set = buildBaseSet(map, planKeys, overrides);
  expandDependencies(map, set);
  return catalog.map((f) => f.key).filter((key) => set.has(key));
}

/**
 * Berekent de effectieve set én welke afschakel-overrides door de closure worden
 * teruggedraaid (bijv. `BASIS_CRM` afschakelen terwijl `BASIS_INSPECTIES` aanstaat).
 * Voedt zowel de API-respons (`GET /organizations/:id/entitlements`) als de
 * UI-waarschuwing.
 */
export function analyzeEntitlementsWith(
  catalog: FeatureDef[],
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): EntitlementAnalysis {
  const map = catalogMap(catalog);
  const effectiveSet = buildBaseSet(map, planKeys, overrides);
  expandDependencies(map, effectiveSet);

  const orderedKeys = catalog.map((f) => f.key);
  const warnings: EntitlementWarning[] = [];
  for (const { featureKey, enabled } of overrides) {
    // Alleen afschakel-overrides die tóch effectief blijven, zijn een conflict.
    if (enabled || !map.has(featureKey)) continue;
    const key = featureKey as FeatureKey;
    if (!effectiveSet.has(key)) continue;

    const requiredBy = orderedKeys.filter(
      (other) =>
        other !== key &&
        effectiveSet.has(other) &&
        transitiveDeps(map, other).has(key),
    );
    // Effectief ondanks afschakeling, maar niets hangt ervan af → kan niet, maar
    // defensief: alleen melden als er daadwerkelijk een afhankelijke is.
    if (requiredBy.length > 0) {
      warnings.push({ featureKey: key, requiredBy });
    }
  }

  return {
    effective: orderedKeys.filter((key) => effectiveSet.has(key)),
    warnings,
  };
}

/**
 * Sluiting van een verzameling geselecteerde keys: welke extra features worden
 * automatisch mee-geactiveerd door de dependency-closure. Voedt de hint
 * "X wordt automatisch geactiveerd" in de plan-editor.
 */
export function forcedDependencies(
  catalog: FeatureDef[],
  selectedKeys: string[],
): Set<string> {
  const map = catalogMap(catalog);
  const full = new Set<FeatureKey>();
  for (const k of selectedKeys) if (map.has(k)) full.add(k as FeatureKey);
  expandDependencies(map, full);
  const forced = new Set<string>();
  for (const k of full) if (!selectedKeys.includes(k)) forced.add(k);
  return forced;
}

/** Huidige override-staat van één feature (PLAN = volgt het plan). */
export function overrideStateFor(
  featureKey: string,
  overrides: { featureKey: string; enabled: boolean }[],
): FeatureOverrideState {
  const o = overrides.find((x) => x.featureKey === featureKey);
  if (!o) return FeatureOverrideState.PLAN;
  return o.enabled
    ? FeatureOverrideState.ENABLED
    : FeatureOverrideState.DISABLED;
}

// ─── Static-catalog convenience (gebonden aan FEATURE_CATALOG_LIST) ──────────
// De backend werkt altijd met de volledige ingebouwde catalogus; deze wrappers
// houden de bestaande 2-arg call-sites (entitlements.service / organizations.service)
// én de pure unit-test byte-identiek.

/** Effectieve feature-keys o.b.v. de volledige ingebouwde catalogus. */
export function resolveEffectiveFeatures(
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): FeatureKey[] {
  return resolveEffectiveFeaturesWith(FEATURE_CATALOG_LIST, planKeys, overrides);
}

/** Effectieve set + dependency-waarschuwingen o.b.v. de volledige ingebouwde catalogus. */
export function analyzeEntitlements(
  planKeys: string[],
  overrides: FeatureOverrideInput[],
): EntitlementAnalysis {
  return analyzeEntitlementsWith(FEATURE_CATALOG_LIST, planKeys, overrides);
}
