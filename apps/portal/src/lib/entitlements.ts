// SaaS-entitlements types + pure dependency-analyse voor de SUPERUSER-beheer-UI
// (PRD-09 §5.3). De catalogus, de analyse-logica en de gedeelde types leven in
// het workspace-pakket @inspexi/entitlements (bron-van-waarheid, gedeeld met de
// backend). Dit bestand her-exporteert ze + houdt de FE-only JSON-view-models die
// niet byte-deelbaar zijn met de Prisma-getypeerde backend-objecten.
import type {
  FeatureDef,
  EntitlementWarning,
  EntitlementAnalysis,
  FeatureOverrideInput,
} from '@inspexi/entitlements';

export type {
  FeatureDef,
  EntitlementWarning,
  EntitlementAnalysis,
  FeatureOverrideInput,
};

export {
  FeatureOverrideState,
  overrideStateFor,
  forcedDependencies,
  analyzeEntitlementsWith as analyzeEntitlements,
} from '@inspexi/entitlements';

/**
 * Per-org override-rij zoals geleverd door de API (JSON). Blijft FE-lokaal: de
 * backend levert `updatedAt` als Prisma `Date`, de portal ziet (na JSON) een string.
 */
export interface FeatureOverride {
  featureKey: string;
  enabled: boolean;
  updatedAt?: string;
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
