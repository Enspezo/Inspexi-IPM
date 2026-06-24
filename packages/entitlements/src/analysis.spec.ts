import {
  analyzeEntitlements,
  forcedDependencies,
  resolveEffectiveFeatures,
} from './analysis';
import { FEATURE_CATALOG_LIST } from './feature-catalog';

const BASIS = ['BASIS_CRM', 'BASIS_UITVOERING', 'BASIS_INSPECTIES', 'BASIS_WORKFLOW'];

describe('entitlements.analysis', () => {
  describe('resolveEffectiveFeatures', () => {
    it('plan-only: geeft exact de plan-features (geordend volgens FEATURE_KEYS)', () => {
      expect(resolveEffectiveFeatures(BASIS, [])).toEqual([
        'BASIS_CRM',
        'BASIS_UITVOERING',
        'BASIS_INSPECTIES',
        'BASIS_WORKFLOW',
      ]);
    });

    it('bijschakel-override voegt de feature + deps toe', () => {
      const result = resolveEffectiveFeatures(BASIS, [
        { featureKey: 'WORKFLOW_COMPLEET', enabled: true },
      ]);
      expect(result).toContain('WORKFLOW_COMPLEET');
      expect(result).toContain('BASIS_WORKFLOW');
    });

    it('afschakel-override verwijdert een feature waar niets van afhangt', () => {
      const result = resolveEffectiveFeatures(
        ['BASIS_CRM', 'BASIS_WORKFLOW', 'WORKFLOW_COMPLEET'],
        [{ featureKey: 'WORKFLOW_COMPLEET', enabled: false }],
      );
      expect(result).not.toContain('WORKFLOW_COMPLEET');
      expect(result).toContain('BASIS_WORKFLOW');
    });

    it('closure wint: BASIS_CRM blijft aan zolang BASIS_INSPECTIES aanstaat', () => {
      const result = resolveEffectiveFeatures(
        ['BASIS_CRM', 'BASIS_INSPECTIES'],
        [{ featureKey: 'BASIS_CRM', enabled: false }],
      );
      expect(result).toEqual(['BASIS_CRM', 'BASIS_INSPECTIES']);
    });

    it('negeert onbekende keys (stale DB-rijen)', () => {
      const result = resolveEffectiveFeatures(['BASIS_CRM', 'NIET_BESTAAND'], [
        { featureKey: 'OOK_WEG', enabled: true },
      ]);
      expect(result).toEqual(['BASIS_CRM']);
    });

    it('lege input → lege set', () => {
      expect(resolveEffectiveFeatures([], [])).toEqual([]);
    });
  });

  describe('analyzeEntitlements — dependency-waarschuwingen', () => {
    it('zonder conflict: geen waarschuwingen', () => {
      const { effective, warnings } = analyzeEntitlements(BASIS, []);
      expect(effective).toHaveLength(4);
      expect(warnings).toEqual([]);
    });

    it('afschakeling die de closure terugdraait → waarschuwing met requiredBy', () => {
      // BASIS_CRM uit terwijl BASIS_UITVOERING + BASIS_INSPECTIES eraan hangen.
      const { effective, warnings } = analyzeEntitlements(BASIS, [
        { featureKey: 'BASIS_CRM', enabled: false },
      ]);
      expect(effective).toContain('BASIS_CRM'); // closure wint
      expect(warnings).toHaveLength(1);
      expect(warnings[0].featureKey).toBe('BASIS_CRM');
      expect(warnings[0].requiredBy).toEqual(
        expect.arrayContaining(['BASIS_UITVOERING', 'BASIS_INSPECTIES']),
      );
    });

    it('transitieve afhankelijkheid telt mee (UITVOERING_COMPLEET → BASIS_CRM)', () => {
      const { warnings } = analyzeEntitlements(
        ['BASIS_CRM', 'BASIS_UITVOERING', 'UITVOERING_COMPLEET'],
        [{ featureKey: 'BASIS_CRM', enabled: false }],
      );
      const crmWarning = warnings.find((w) => w.featureKey === 'BASIS_CRM');
      expect(crmWarning).toBeDefined();
      expect(crmWarning!.requiredBy).toEqual(
        expect.arrayContaining(['BASIS_UITVOERING', 'UITVOERING_COMPLEET']),
      );
    });

    it('effectieve afschakeling (niets hangt ervan af) → géén waarschuwing', () => {
      const { effective, warnings } = analyzeEntitlements(
        ['BASIS_WORKFLOW', 'WORKFLOW_COMPLEET'],
        [{ featureKey: 'WORKFLOW_COMPLEET', enabled: false }],
      );
      expect(effective).not.toContain('WORKFLOW_COMPLEET');
      expect(warnings).toEqual([]);
    });
  });

  describe('forcedDependencies', () => {
    it('forceert transitieve deps van de selectie (CRM_COMPLEET → BASIS_CRM)', () => {
      const forced = [
        ...forcedDependencies(FEATURE_CATALOG_LIST, ['CRM_COMPLEET']),
      ];
      expect(forced).toContain('BASIS_CRM');
    });

    it('selectie zonder deps forceert niets', () => {
      expect([
        ...forcedDependencies(FEATURE_CATALOG_LIST, ['BASIS_CRM']),
      ]).toEqual([]);
    });

    it('negeert onbekende keys', () => {
      expect([
        ...forcedDependencies(FEATURE_CATALOG_LIST, ['LEGACY_KEY']),
      ]).toEqual([]);
    });
  });
});
