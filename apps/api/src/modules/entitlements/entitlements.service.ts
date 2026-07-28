import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
import { FeatureKey, resolveEffectiveFeatures } from '@inspexi/entitlements';

interface CacheEntry {
  features: FeatureKey[];
  cachedAt: number;
}

/**
 * Resolver voor de effectieve feature-set van een organisatie (PRD-09 §4.3).
 *
 * Effectieve set = plan-defaults ⊕ per-org-overrides ⊕ transitieve
 * dependency-closure:
 *   1. base   = features van het org-plan (PlanFeature[])     // template
 *   2. delta  = OrganizationFeature[] van de org              // overrides
 *               enabled=true voegt toe, enabled=false haalt weg
 *   3. set    = (base ∪ {overrides:true}) \ {overrides:false}
 *   4. closure: voeg voor elke feature in de set de dependsOn transitief toe
 *
 * Belangrijk: de dependency-closure (stap 4) draait NÁ de afschakel-overrides
 * (stap 3) en wint daarvan — `BASIS_CRM` kan niet afgeschakeld worden zolang
 * `BASIS_INSPECTIES`/`BASIS_UITVOERING` aanstaan (die hangen ervan af).
 *
 * Per-org gecachet (5 min TTL), naar het patroon van TenantCacheService. De
 * cache wordt ge-invalideerd bij elke schrijf op Plan / PlanFeature /
 * OrganizationFeature / Organization.planId (zie {@link invalidate} /
 * {@link clear} — aangeroepen door de SUPERUSER-beheer-laag in een latere fase).
 *
 * Deze fase kent nog GEEN enforcement: de resolver berekent alleen de set, er
 * is nog geen guard die hem afdwingt.
 */
@Injectable()
export class EntitlementsService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Service-laag entitlement-guard voor plekken die *niet* via een controller-route
   * lopen (PRD-12 §Fase E): het koppelen van een `projectPhaseId` gebeurt op de
   * update-endpoints van quotes/planning/work-orders/inspection-plans, dus de
   * {@link FeatureGuard} kan daar niet gaten. Deze helper spiegelt exact diens
   * semantiek zodat dev/e2e-gedrag identiek blijft:
   *
   * - `orgId === null` (SUPERUSER / onbekende host): op localhost door, in productie dicht.
   * - Nog niet ingerichte org (lege feature-set): op localhost door (fixtures zonder plan).
   * - Anders: gooit {@link ForbiddenException} als de feature niet in de set zit.
   *
   * Gooit dezelfde `FEATURE_NOT_IN_PLAN`-shape als de guard, met een aanroeper-
   * specifieke NL-melding.
   */
  async assertFeature(
    orgId: string | null,
    feature: FeatureKey,
    message = 'Deze functie zit niet in uw abonnement',
  ): Promise<void> {
    const isLocalhost =
      this.config.get<string>('BASE_DOMAIN', 'localhost') === 'localhost';

    if (orgId === null) {
      if (isLocalhost) return;
      throw this.featureForbidden(message);
    }

    const enabled = await this.getEnabledFeatures(orgId);
    // Nog niet ingerichte org (lege set) → op localhost niet gaten (mirrors guard).
    if (enabled.length === 0 && isLocalhost) return;
    if (!enabled.includes(feature)) {
      throw this.featureForbidden(message);
    }
  }

  private featureForbidden(message: string): ForbiddenException {
    return new ForbiddenException({
      success: false,
      message,
      code: 'FEATURE_NOT_IN_PLAN',
    });
  }

  /**
   * Effectieve feature-keys voor een org, deterministisch geordend volgens
   * FEATURE_KEYS. Een org zonder plan en zonder overrides krijgt een lege set
   * (alleen core-functies, die niet in de catalogus staan, blijven altijd aan).
   */
  async getEnabledFeatures(orgId: string): Promise<FeatureKey[]> {
    const cached = this.cache.get(orgId);
    if (cached && Date.now() - cached.cachedAt < this.TTL) {
      // Kopie teruggeven: een caller mag de gecachte array nooit kunnen muteren.
      return [...cached.features];
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        plan: { select: { features: { select: { featureKey: true } } } },
        features: { select: { featureKey: true, enabled: true } },
      },
    });

    const planKeys = org?.plan?.features.map((f) => f.featureKey) ?? [];
    const overrides = org?.features ?? [];

    // De pure resolver (plan ⊕ overrides ⊕ transitieve closure) leeft in
    // entitlements.analysis.ts en wordt gedeeld met de SUPERUSER-beheer-laag.
    const features = resolveEffectiveFeatures(planKeys, overrides);
    this.cache.set(orgId, { features, cachedAt: Date.now() });
    // Idem voor de verse berekening: de cache houdt het origineel, de caller een kopie.
    return [...features];
  }

  /** Invalideert de gecachte set voor één org (na een schrijf die de org raakt). */
  invalidate(orgId: string): void {
    this.cache.delete(orgId);
  }

  /**
   * Leegt de hele cache. Aanroepen bij plan-brede wijzigingen (Plan/PlanFeature),
   * die meerdere orgs tegelijk kunnen raken.
   */
  clear(): void {
    this.cache.clear();
  }
}
