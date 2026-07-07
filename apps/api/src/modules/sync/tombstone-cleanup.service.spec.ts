import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { SYNC_ENTITIES } from './sync-mapper';
import {
  TombstoneCleanupService,
  TOMBSTONE_DELETE_ORDER,
  TOMBSTONE_PARENT_GUARDS,
  TOMBSTONE_RETENTION_DAYS,
  type TombstoneModel,
} from './tombstone-cleanup.service';

// ── DMMF-helpers ────────────────────────────────────────────
// De volgorde- en guard-invarianten worden uit het live Prisma-schema (DMMF)
// afgeleid i.p.v. uit een zelf-onderhouden lijst. Zo faalt de test automatisch
// zodra iemand een nieuwe verplichte relatie zonder `onDelete` naar een gepurged
// model toevoegt, of de purge-doelen wijzigt.

const PURGE_TARGETS = new Set<string>(TOMBSTONE_DELETE_ORDER);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const modelByDelegate = (delegate: string) =>
  Prisma.dmmf.datamodel.models.find((m) => lowerFirst(m.name) === delegate);

/** FK-houdende relatie? (deze kant draagt de scalar foreign key). */
const holdsForeignKey = (f: Prisma.DMMF.Field) =>
  f.kind === 'object' && (f.relationFromFields?.length ?? 0) > 0;

/**
 * Effectieve onDelete-actie. Prisma-default: een verplichte FK zonder expliciete
 * `onDelete` is `Restrict`, een optionele is `SetNull`.
 */
const effectiveOnDelete = (f: Prisma.DMMF.Field): string =>
  f.relationOnDelete ?? (f.isRequired ? 'Restrict' : 'SetNull');

/** Kind-delegate → sync-ouders die het via een FK aanwijst (self-refs uitgesloten). */
const dmmfOrderingDeps = (): Map<TombstoneModel, TombstoneModel[]> => {
  const deps = new Map<TombstoneModel, TombstoneModel[]>();
  for (const child of TOMBSTONE_DELETE_ORDER) {
    const model = modelByDelegate(child);
    if (!model) continue;
    const parents = model.fields
      .filter(holdsForeignKey)
      .map((f) => lowerFirst(f.type))
      .filter((p) => p !== child && PURGE_TARGETS.has(p)) as TombstoneModel[];
    deps.set(child, parents);
  }
  return deps;
};

/**
 * Per purge-doel: de back-relation-veldnamen van inbound RESTRICT/NoAction-FK's die
 * een hard-delete met P2003 zouden blokkeren. Dít is de set die {@link
 * TOMBSTONE_PARENT_GUARDS} minimaal moet dekken.
 */
const dmmfRequiredGuards = (): Map<string, Set<string>> => {
  const required = new Map<string, Set<string>>();
  for (const t of TOMBSTONE_DELETE_ORDER) required.set(t, new Set());

  for (const model of Prisma.dmmf.datamodel.models) {
    for (const f of model.fields) {
      if (!holdsForeignKey(f)) continue;
      const parent = lowerFirst(f.type);
      if (!PURGE_TARGETS.has(parent)) continue;
      const action = effectiveOnDelete(f);
      if (action !== 'Restrict' && action !== 'NoAction') continue;

      // Back-relation-veld op de ouder = het list-veld met dezelfde relationName.
      const back = modelByDelegate(parent)?.fields.find(
        (bf) =>
          bf.kind === 'object' &&
          bf.relationName === f.relationName &&
          (bf.relationFromFields?.length ?? 0) === 0,
      );
      if (back) required.get(parent)!.add(back.name);
    }
  }
  return required;
};

describe('TombstoneCleanupService — schema-afgeleide invarianten', () => {
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

  it('verwijdert elk kind vóór zijn sync-FK-ouder (DMMF-afgeleid, topologisch geldig)', () => {
    const deps = dmmfOrderingDeps();
    // Sanity: de bekende kind→ouder-relaties zitten er echt in.
    expect(deps.get('finding')).toEqual(
      expect.arrayContaining(['assetNode', 'inspectionPlan']),
    );
    for (const [child, parents] of deps) {
      for (const parent of parents) {
        expect(indexOf(child)).toBeLessThan(indexOf(parent));
      }
    }
  });

  it('kent de twee ouder-entiteiten als laatste toe', () => {
    expect(order[order.length - 2]).toBe('assetNode');
    expect(order[order.length - 1]).toBe('inspectionPlan');
  });

  it('guardt elke inbound RESTRICT-FK naar een gepurged model (DMMF-afgeleid)', () => {
    const required = dmmfRequiredGuards();

    // De drie NO-GO-gevallen uit de review moeten echt als vereiste guards opduiken.
    expect(required.get('assetNode')).toContain('planScopes');
    expect(required.get('inspectionPlan')).toContain('reports');
    expect(required.get('inspectionPlan')).toContain('generatedDocuments');

    for (const [parent, relations] of required) {
      const guarded = new Set<string>(
        parent in TOMBSTONE_PARENT_GUARDS
          ? TOMBSTONE_PARENT_GUARDS[parent as keyof typeof TOMBSTONE_PARENT_GUARDS]
          : [],
      );
      for (const rel of relations) {
        // Faalt zodra een nieuwe verplichte relatie zonder onDelete ongeguard blijft.
        expect(guarded).toContain(rel);
      }
    }
  });

  it('verwijst elke gedeclareerde guard naar een bestaande back-relation op dat model', () => {
    for (const [parent, relations] of Object.entries(TOMBSTONE_PARENT_GUARDS)) {
      const model = modelByDelegate(parent);
      expect(model).toBeDefined();
      const listRelations = new Set(
        model!.fields.filter((f) => f.kind === 'object').map((f) => f.name),
      );
      for (const rel of relations) {
        expect(listRelations).toContain(rel);
      }
    }
  });
});

describe('TombstoneCleanupService — purgeExpiredTombstones', () => {
  let service: TombstoneCleanupService;

  // Elk delegate telt 0; individuele tests overschrijven de count/impl waar nodig.
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
    for (const key of TOMBSTONE_DELETE_ORDER) {
      (mockPrisma as Record<string, { deleteMany: jest.Mock }>)[key].deleteMany.mockResolvedValue({
        count: 0,
      });
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [TombstoneCleanupService, { provide: PrismaService, useValue: mockPrisma }],
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
      (mockPrisma as Record<string, { deleteMany: jest.Mock }>)[model].deleteMany.mockImplementation(
        () => {
          seq.push(model);
          return Promise.resolve({ count: 0 });
        },
      );
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

    // Leaf-entiteiten krijgen géén guard: puur op deletedAt.
    const findingWhere = mockPrisma.finding.deleteMany.mock.calls[0][0].where;
    expect(findingWhere).toEqual({ deletedAt: { lt: expect.any(Date) } });
  });

  // ── De drie NO-GO-scenario's uit de review (RESTRICT-FK's) ──

  it('scenario: getombstonede LOCATION-node in een plan-scope blokkeert de batch niet (planScopes-guard)', async () => {
    await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    // InspectionPlanLocation.assetNode is RESTRICT; zonder deze guard zou een node
    // die nog in een plan-scope zit een P2003 gooien en de hele deleteMany blokkeren.
    const nodeWhere = mockPrisma.assetNode.deleteMany.mock.calls[0][0].where;
    expect(nodeWhere.planScopes).toEqual({ none: {} });
  });

  it('scenario: verlopen plan mét Report wordt overgeslagen i.p.v. geblokkeerd (reports-guard)', async () => {
    await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    const planWhere = mockPrisma.inspectionPlan.deleteMany.mock.calls[0][0].where;
    expect(planWhere.reports).toEqual({ none: {} });
  });

  it('scenario: verlopen plan mét GeneratedDocument wordt overgeslagen (generatedDocuments-guard)', async () => {
    await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    const planWhere = mockPrisma.inspectionPlan.deleteMany.mock.calls[0][0].where;
    expect(planWhere.generatedDocuments).toEqual({ none: {} });
  });

  it('somt de verwijderde aantallen per model op', async () => {
    mockPrisma.finding.deleteMany.mockResolvedValue({ count: 3 });
    mockPrisma.inspectionPlan.deleteMany.mockResolvedValue({ count: 1 });

    const summary = await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    expect(summary.finding).toBe(3);
    expect(summary.inspectionPlan).toBe(1);
    expect(summary.assetNode).toBe(0);
  });

  it('vangt een fout per stap af en gaat door met de overige modellen', async () => {
    const boom = new Error('P2003: FK constraint');
    mockPrisma.assetNode.deleteMany.mockRejectedValue(boom);
    mockPrisma.inspectionPlan.deleteMany.mockResolvedValue({ count: 2 });

    const summary = await service.purgeExpiredTombstones(new Date('2026-07-06T00:00:00.000Z'));

    // Geen throw; het falende model telt 0; latere modellen draaien nog.
    expect(summary.assetNode).toBe(0);
    expect(summary.inspectionPlan).toBe(2);
    expect(mockPrisma.inspectionPlan.deleteMany).toHaveBeenCalled();
  });
});

describe('TombstoneCleanupService — handleCron', () => {
  let service: TombstoneCleanupService;
  let purgeSpy: jest.SpyInstance;
  const originalEnv = process.env.TOMBSTONE_CLEANUP_ENABLED;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TombstoneCleanupService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    service = module.get(TombstoneCleanupService);
    purgeSpy = jest
      .spyOn(service, 'purgeExpiredTombstones')
      .mockResolvedValue({
        finding: 0,
        visualInspection: 0,
        measurementRecord: 0,
        measurementSheetRecord: 0,
        standaloneMeasurement: 0,
        assetNode: 0,
        inspectionPlan: 0,
      });
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.TOMBSTONE_CLEANUP_ENABLED;
    else process.env.TOMBSTONE_CLEANUP_ENABLED = originalEnv;
    jest.restoreAllMocks();
  });

  it('draait standaard (kill-switch niet gezet)', async () => {
    delete process.env.TOMBSTONE_CLEANUP_ENABLED;
    await service.handleCron();
    expect(purgeSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['0', 'false', 'FALSE'])(
    'slaat over als de kill-switch %s is',
    async (value) => {
      process.env.TOMBSTONE_CLEANUP_ENABLED = value;
      await service.handleCron();
      expect(purgeSpy).not.toHaveBeenCalled();
    },
  );

  it('draait bij elke andere waarde (bv. "1")', async () => {
    process.env.TOMBSTONE_CLEANUP_ENABLED = '1';
    await service.handleCron();
    expect(purgeSpy).toHaveBeenCalledTimes(1);
  });

  it('geeft nooit een unhandled rejection, ook niet als purge gooit', async () => {
    delete process.env.TOMBSTONE_CLEANUP_ENABLED;
    purgeSpy.mockRejectedValue(new Error('onverwacht'));
    await expect(service.handleCron()).resolves.toBeUndefined();
  });
});
