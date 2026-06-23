import { describe, it, expect } from 'vitest';
import { FEATURE_KEYS as PORTAL_FEATURE_KEYS } from './features';
import {
  analyzeEntitlements as portalAnalyze,
  forcedDependencies as portalForced,
  type FeatureDef,
} from './entitlements';
// Backend bron-van-waarheid rechtstreeks importeren. feature-catalog.ts en
// entitlements.analysis.ts zijn pure TS (geen Nest/Prisma), dus veilig te laden
// in een portal-test. Dit is de drift-guard: loopt de portal-spiegel uit de pas
// met de backend, dan faalt deze test rood in CI (i.p.v. stil te verschillen).
import {
  FEATURE_KEYS as API_FEATURE_KEYS,
  FEATURE_CATALOG,
} from '../../../api/src/modules/entitlements/feature-catalog';
import {
  analyzeEntitlements as apiAnalyze,
  resolveEffectiveFeatures as apiResolve,
} from '../../../api/src/modules/entitlements/entitlements.analysis';

// De portal krijgt de catalogus normaal van `GET /admin/features`; hier bouwen we
// hem uit de backend-bron zodat de analyse-functies vergelijkbaar zijn.
const catalog: FeatureDef[] = API_FEATURE_KEYS.map((k) => FEATURE_CATALOG[k]);

interface Scenario {
  name: string;
  planKeys: string[];
  overrides: { featureKey: string; enabled: boolean }[];
}

const SCENARIOS: Scenario[] = [
  { name: 'leeg plan', planKeys: [], overrides: [] },
  {
    name: 'Basis-plan',
    planKeys: ['BASIS_CRM', 'BASIS_UITVOERING', 'BASIS_INSPECTIES', 'BASIS_WORKFLOW'],
    overrides: [],
  },
  {
    name: 'closure-conflict (BASIS_CRM afschakelen onder BASIS_INSPECTIES)',
    planKeys: ['BASIS_CRM', 'BASIS_INSPECTIES'],
    overrides: [{ featureKey: 'BASIS_CRM', enabled: false }],
  },
  {
    name: 'mix: WORKFLOW_COMPLEET bijschakelen bovenop Basis',
    planKeys: ['BASIS_CRM', 'BASIS_WORKFLOW'],
    overrides: [{ featureKey: 'WORKFLOW_COMPLEET', enabled: true }],
  },
  { name: 'alle keys', planKeys: [...API_FEATURE_KEYS], overrides: [] },
  {
    name: 'onbekende keys worden genegeerd',
    planKeys: ['BASIS_CRM', 'LEGACY_KEY'],
    overrides: [{ featureKey: 'OOK_WEG', enabled: true }],
  },
];

describe('entitlements frontend/backend drift-guard', () => {
  it('FEATURE_KEYS spiegelt de backend exact (incl. volgorde)', () => {
    expect([...PORTAL_FEATURE_KEYS]).toEqual([...API_FEATURE_KEYS]);
  });

  it.each(SCENARIOS)(
    'analyzeEntitlements geeft identieke output als de backend — $name',
    ({ planKeys, overrides }) => {
      const fe = portalAnalyze(catalog, planKeys, overrides);
      const be = apiAnalyze(planKeys, overrides);
      expect(fe.effective).toEqual(be.effective);
      expect(fe.warnings).toEqual(be.warnings);
      // En de portal-effective moet ook de pure backend-resolver evenaren.
      expect(fe.effective).toEqual(apiResolve(planKeys, overrides));
    },
  );

  it('forcedDependencies komt overeen met de backend-closure', () => {
    // CRM_COMPLEET hangt af van BASIS_CRM → die wordt geforceerd mee-geactiveerd.
    const selected = ['CRM_COMPLEET'];
    const forced = [...portalForced(catalog, selected)].sort();
    const backendForced = apiResolve(selected, [])
      .filter((k) => !selected.includes(k))
      .sort();
    expect(forced).toEqual(backendForced);
    expect(forced).toContain('BASIS_CRM');
  });
});
