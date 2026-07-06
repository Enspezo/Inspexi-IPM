import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma';
import { SYNC_ENTITIES } from './sync-mapper';
import {
  TombstoneCleanupService,
  TOMBSTONE_DELETE_ORDER,
  TOMBSTONE_FK_DEPENDENCIES,
  TOMBSTONE_RETENTION_DAYS,
  type TombstoneModel,
} from './tombstone-cleanup.service';

describe('TombstoneCleanupService — volgorde-logica', () => {
  const order = TOMBSTONE_DELETE_ORDER;
  const indexOf = (m: TombstoneModel) => order.indexOf(m);

  it('dekt exact de sync-contract-entiteiten (geen model vergeten of te veel)', () => {
    const syncModels = new Set(Object.values(SYNC_ENTITIES).map((e) => e.model));
    const orderModels = new Set<string>(order);
    expect(orderModels).toEqual(syncModels);
  });

  it('bevat geen duplicaten', () => {
    expect(new Set(order).size).toBe(order.length);
  });

  it('verwijdert elk kind vóór zijn FK-ouder (topologisch geldig)', () => {
    for (const [child, parents] of Object.entries(TOMBSTONE_FK_DEPENDENCIES)) {
      for (const parent of parents) {
        expect(indexOf(child as TombstoneModel)).toBeLessThan(indexOf(parent));
      }
    }
  });

  it('kent de twee ouder-entiteiten als laatste toe', () => {
    expect(order[order.length - 2]).toBe('assetNode');
    expect(order[order.length - 1]).toBe('inspectionPlan');
  });

  it('elke afhankelijkheid verwijst naar een bekend sync-model', () => {
    for (const parents of Object.values(TOMBSTONE_FK_DEPENDENCIES)) {
      for (const parent of parents) {
        expect(order).toContain(parent);
      }
    }
  });
});

describe('TombstoneCleanupService — purgeExpiredTombstones', () => {
  let service: TombstoneCleanupService;

  // Elk delegate telt 0; individuele tests overschrijven de count waar nodig.
  const del = (count = 0) => jest.fn().mockResolvedValue({ count });
  const mockPrisma = {
    finding: { deleteMany: del() },
    visualInspection: { deleteMany: del() },
    measurementRecord: { deleteMany: del() },
    measurementSheetRecord: { deleteMany: del() },
    standaloneMeasurement: { deleteMany: del() },
    assetNode: { deleteMany: del() },
    inspectionPlan: { deleteMany: del() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TombstoneCleanupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(TombstoneCleanupService);
  });

  it('rekent de cutoff op precies 90 dagen vóór `now`', async () => {
    const now = new Date('2026-07-06T03:00:00.000Z');
    await service.purgeExpiredTombstones(now);

    const expectedCutoff = new Date('2026-04-07T03:00:00.000Z'); // 90 dagen eerder
    expect(TOMBSTONE_RETENTION_DAYS).toBe(90);
    const call = mockPrisma.finding.deleteMany.mock.calls[0][0];
    expect(call.where.deletedAt.lt).toEqual(expectedCutoff);
  });

  it('roept de deletes aan in de FK-veilige volgorde', async () => {
    const seq: string[] = [];
    for (const model of TOMBSTONE_DELETE_ORDER) {
      (mockPrisma as any)[model].deleteMany.mockImplementation(() => {
        seq.push(model);
        return Promise.resolve({ count: 0 });
      });
    }

    await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    expect(seq).toEqual([...TOMBSTONE_DELETE_ORDER]);
  });

  it('vrijwaart ouders met nog-levende sync-kinderen (guard in de where)', async () => {
    await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    const planWhere = mockPrisma.inspectionPlan.deleteMany.mock.calls[0][0].where;
    expect(planWhere.findings).toEqual({ none: {} });
    expect(planWhere.visualInspections).toEqual({ none: {} });
    expect(planWhere.standaloneMeasurements).toEqual({ none: {} });

    const nodeWhere = mockPrisma.assetNode.deleteMany.mock.calls[0][0].where;
    expect(nodeWhere.children).toEqual({ none: {} });
    expect(nodeWhere.findings).toEqual({ none: {} });

    // Leaf-entiteiten krijgen géén children-guard: puur op deletedAt.
    const findingWhere = mockPrisma.finding.deleteMany.mock.calls[0][0].where;
    expect(findingWhere).toEqual({ deletedAt: { lt: expect.any(Date) } });
  });

  it('somt de verwijderde aantallen per model op', async () => {
    mockPrisma.finding.deleteMany.mockResolvedValue({ count: 3 });
    mockPrisma.inspectionPlan.deleteMany.mockResolvedValue({ count: 1 });

    const summary = await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    expect(summary.finding).toBe(3);
    expect(summary.inspectionPlan).toBe(1);
    expect(summary.assetNode).toBe(0);
  });
});
