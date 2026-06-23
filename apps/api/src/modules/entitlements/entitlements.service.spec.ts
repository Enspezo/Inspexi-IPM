import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsService } from './entitlements.service';
import { PrismaService } from '@/prisma';

/**
 * Bouwt de `organization.findUnique`-returnshape die EntitlementsService
 * selecteert: het plan met zijn feature-keys + de per-org overrides.
 */
function orgRow(
  planKeys: string[] | null,
  overrides: { featureKey: string; enabled: boolean }[] = [],
) {
  return {
    plan: planKeys ? { features: planKeys.map((featureKey) => ({ featureKey })) } : null,
    features: overrides,
  };
}

describe('EntitlementsService', () => {
  let service: EntitlementsService;

  const mockPrisma = {
    organization: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EntitlementsService>(EntitlementsService);
  });

  describe('getEnabledFeatures — resolver', () => {
    it('(a) plan-only: geeft exact de plan-features terug (geordend)', async () => {
      // Basis-plan: alle deps zijn al voldaan, dus closure voegt niets toe.
      mockPrisma.organization.findUnique.mockResolvedValue(
        orgRow(['BASIS_CRM', 'BASIS_UITVOERING', 'BASIS_INSPECTIES', 'BASIS_WORKFLOW']),
      );

      const result = await service.getEnabledFeatures('org-basis');

      // Deterministische volgorde volgens FEATURE_KEYS.
      expect(result).toEqual([
        'BASIS_CRM',
        'BASIS_UITVOERING',
        'BASIS_INSPECTIES',
        'BASIS_WORKFLOW',
      ]);
    });

    it('(b) plan + bijschakel-override: voegt de feature (en zijn deps) toe', async () => {
      // Basis + override WORKFLOW_COMPLEET=true (de "inspeximix"-casus).
      mockPrisma.organization.findUnique.mockResolvedValue(
        orgRow(
          ['BASIS_CRM', 'BASIS_UITVOERING', 'BASIS_INSPECTIES', 'BASIS_WORKFLOW'],
          [{ featureKey: 'WORKFLOW_COMPLEET', enabled: true }],
        ),
      );

      const result = await service.getEnabledFeatures('org-mix');

      expect(result).toContain('WORKFLOW_COMPLEET');
      // dependency BASIS_WORKFLOW blijft uiteraard aanwezig
      expect(result).toContain('BASIS_WORKFLOW');
      expect(result).toEqual([
        'BASIS_CRM',
        'BASIS_UITVOERING',
        'BASIS_INSPECTIES',
        'BASIS_WORKFLOW',
        'WORKFLOW_COMPLEET',
      ]);
    });

    it('(c) plan + afschakel-override: haalt een feature weg als niets ervan afhangt', async () => {
      // Compleet-plan (alle 9), override WEBHOOKS=false. Niets hangt af van WEBHOOKS,
      // dus de closure zet hem niet terug.
      mockPrisma.organization.findUnique.mockResolvedValue(
        orgRow(
          [
            'BASIS_CRM',
            'CRM_COMPLEET',
            'BASIS_UITVOERING',
            'UITVOERING_COMPLEET',
            'BASIS_INSPECTIES',
            'BASIS_WORKFLOW',
            'WORKFLOW_COMPLEET',
            'WEBHOOKS',
            'CUSTOM_FIELDS',
          ],
          [{ featureKey: 'WEBHOOKS', enabled: false }],
        ),
      );

      const result = await service.getEnabledFeatures('org-compleet');

      expect(result).not.toContain('WEBHOOKS');
      expect(result).toContain('CUSTOM_FIELDS');
      expect(result).toHaveLength(8);
    });

    it('(d) afschakel-override die door de closure teruggezet wordt (closure wint)', async () => {
      // BASIS_INSPECTIES hangt af van BASIS_CRM. Een override BASIS_CRM=false wordt
      // door de dependency-closure teruggedraaid zolang BASIS_INSPECTIES aanstaat.
      mockPrisma.organization.findUnique.mockResolvedValue(
        orgRow(
          ['BASIS_CRM', 'BASIS_INSPECTIES'],
          [{ featureKey: 'BASIS_CRM', enabled: false }],
        ),
      );

      const result = await service.getEnabledFeatures('org-inspecties');

      expect(result).toContain('BASIS_CRM');
      expect(result).toEqual(['BASIS_CRM', 'BASIS_INSPECTIES']);
    });

    it('org zonder plan en zonder overrides: lege set (alleen core, buiten de catalogus)', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(orgRow(null, []));

      const result = await service.getEnabledFeatures('org-planless');

      expect(result).toEqual([]);
    });

    it('negeert onbekende feature-keys (defensief tegen stale DB-rijen)', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(
        orgRow(['BASIS_CRM', 'LEGACY_KEY_DIE_NIET_BESTAAT'], [
          { featureKey: 'OOK_WEG', enabled: true },
        ]),
      );

      const result = await service.getEnabledFeatures('org-stale');

      expect(result).toEqual(['BASIS_CRM']);
    });
  });

  describe('caching', () => {
    it('(e) cachet per org en re-queryt pas na invalidate', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(orgRow(['BASIS_CRM']));

      await service.getEnabledFeatures('org-1');
      await service.getEnabledFeatures('org-1');
      // Tweede call komt uit de cache → DB één keer geraakt.
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1);

      // Schrijf-hook: invalidatie dwingt een verse query af.
      service.invalidate('org-1');
      await service.getEnabledFeatures('org-1');
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(2);
    });

    it('clear() leegt de hele cache (plan-brede wijziging)', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(orgRow(['BASIS_CRM']));

      await service.getEnabledFeatures('org-a');
      await service.getEnabledFeatures('org-b');
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(2);

      service.clear();
      await service.getEnabledFeatures('org-a');
      await service.getEnabledFeatures('org-b');
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(4);
    });

    it('(f) retourneert een kopie — muteren van het resultaat raakt de cache niet', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(
        orgRow(['BASIS_CRM', 'BASIS_WORKFLOW']),
      );

      // Eerste call vult de cache. Muteer het resultaat agressief.
      const first = await service.getEnabledFeatures('org-copy');
      first.push('GEHACKTE_KEY' as never);
      first.length = 0;

      // Tweede call komt uit de cache (DB niet opnieuw geraakt) en moet ongeschonden zijn.
      const second = await service.getEnabledFeatures('org-copy');
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1);
      expect(second).toEqual(['BASIS_CRM', 'BASIS_WORKFLOW']);
      // Elke call levert bovendien een eigen kopie, geen gedeelde referentie.
      expect(second).not.toBe(first);
    });

    it('vervalt na de TTL (5 min) en queryt opnieuw', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(orgRow(['BASIS_CRM']));

      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      await service.getEnabledFeatures('org-ttl');
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1);

      // Binnen de TTL → nog steeds gecachet.
      nowSpy.mockReturnValue(1_000_000 + 4 * 60 * 1000);
      await service.getEnabledFeatures('org-ttl');
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1);

      // Voorbij de TTL → verse query.
      nowSpy.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);
      await service.getEnabledFeatures('org-ttl');
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(2);

      nowSpy.mockRestore();
    });
  });
});
