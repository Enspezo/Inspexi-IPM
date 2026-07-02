import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlansService } from './plans.service';
import { EntitlementsService } from './entitlements.service';
import { PrismaService } from '@/prisma';

describe('PlansService', () => {
  let service: PlansService;

  const mockPrisma = {
    plan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    planFeature: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    // Interactieve transactie: voer de callback uit met dezelfde mock als `tx`,
    // zodat de bestaande tx.plan.* / tx.planFeature.*-asserts blijven gelden.
    // Expliciete return-type breekt de circulaire inferentie (mockPrisma → cb → mockPrisma).
    $transaction: jest.fn(
      (cb: (tx: any) => unknown): Promise<unknown> =>
        Promise.resolve(cb(mockPrisma)),
    ),
  };

  const mockEntitlements = {
    clear: jest.fn(),
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EntitlementsService, useValue: mockEntitlements },
      ],
    }).compile();
    service = module.get<PlansService>(PlansService);
  });

  describe('create', () => {
    it('weigert onbekende feature-keys', async () => {
      await expect(
        service.create({
          name: 'Test',
          slug: 'test',
          featureKeys: ['BASIS_CRM', 'NIET_BESTAAND'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.plan.create).not.toHaveBeenCalled();
    });

    it('weigert een dubbele slug', async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.create({ name: 'Basis', slug: 'basis', featureKeys: ['BASIS_CRM'] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maakt plan + features (als losse creates) aan en leegt de cache', async () => {
      mockPrisma.plan.findUnique
        .mockResolvedValueOnce(null) // slug-check
        .mockResolvedValueOnce({ id: 'p1', features: [], _count: { organizations: 0 } }); // findOne
      mockPrisma.plan.create.mockResolvedValue({ id: 'p1' });
      mockPrisma.planFeature.create.mockResolvedValue({});

      await service.create({
        name: 'Basis',
        slug: 'basis',
        featureKeys: ['BASIS_WORKFLOW', 'BASIS_CRM'],
      });

      // Plan + features in één interactieve transactie (atomair).
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.plan.create).toHaveBeenCalledTimes(1);
      // Eén create per feature-key.
      expect(mockPrisma.planFeature.create).toHaveBeenCalledTimes(2);
      expect(mockEntitlements.clear).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('dift de feature-set (toevoegen + verwijderen) en leegt de cache', async () => {
      // findOne (existence) → plan met BASIS_CRM + WORKFLOW_COMPLEET
      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'p1',
        features: [{ featureKey: 'BASIS_CRM' }, { featureKey: 'WORKFLOW_COMPLEET' }],
        _count: { organizations: 0 },
      });
      mockPrisma.planFeature.findMany.mockResolvedValue([
        { id: 'f1', featureKey: 'BASIS_CRM' },
        { id: 'f2', featureKey: 'WORKFLOW_COMPLEET' },
      ]);

      // Gewenst: BASIS_CRM + BASIS_WORKFLOW → voeg BASIS_WORKFLOW toe, haal WORKFLOW_COMPLEET weg.
      await service.update('p1', { featureKeys: ['BASIS_CRM', 'BASIS_WORKFLOW'] });

      // Meta-update + feature-diff in één interactieve transactie (atomair).
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.planFeature.create).toHaveBeenCalledWith({
        data: { planId: 'p1', featureKey: 'BASIS_WORKFLOW' },
      });
      expect(mockPrisma.planFeature.delete).toHaveBeenCalledWith({ where: { id: 'f2' } });
      expect(mockEntitlements.clear).toHaveBeenCalled();
    });

    it('werkt alleen meta bij als featureKeys ontbreekt', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'p1',
        features: [],
        _count: { organizations: 0 },
      });
      await service.update('p1', { name: 'Nieuwe naam' });
      expect(mockPrisma.plan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'Nieuwe naam' },
      });
      expect(mockPrisma.planFeature.findMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('blokkeert verwijderen als het plan is toegewezen', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'p1',
        _count: { organizations: 2 },
      });
      await expect(service.remove('p1')).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.plan.delete).not.toHaveBeenCalled();
    });

    it('verwijdert een ongebruikt plan en leegt de cache', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'p1',
        _count: { organizations: 0 },
      });
      await service.remove('p1');
      expect(mockPrisma.plan.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(mockEntitlements.clear).toHaveBeenCalled();
    });

    it('404 als het plan niet bestaat', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getCatalog', () => {
    it('levert alle features met afhankelijkheden', () => {
      const catalog = service.getCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(9);
      const crmCompleet = catalog.find((f) => f.key === 'CRM_COMPLEET');
      expect(crmCompleet?.dependsOn).toContain('BASIS_CRM');
    });
  });
});
