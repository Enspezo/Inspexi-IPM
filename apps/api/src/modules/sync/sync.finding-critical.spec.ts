// Sync-push × Finding.isCritical (PRD-14): het veld is server-owned — het staat
// niet in de sync-mapper-whitelist en wordt in computeFindingCriticalField
// (vóór de write) herberekend uit classificationValues × het classificatiemodel
// van het plan (per-push gecachet). resetCriticalRepairNotified (alléén ná een
// geslaagde write, review #5) reset InspectionPlan.criticalRepairNotifiedAt bij
// heropen van een kritieke finding, bij een nieuwe open+kritieke finding en bij
// becameOpenCritical (review #7) — maar NIET bij een LWW-conflict.
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { SyncService } from './sync.service';
import { PrismaService } from '@/prisma';
import { ChatSyncService } from '../chat/chat-sync.service';
import { NumberingService } from '../numbering/numbering.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { InspectionPlansService } from '../inspection-plans/inspection-plans.service';

describe('SyncService — finding isCritical (PRD-14)', () => {
  let service: SyncService;

  const delegate = () => ({
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  });

  const mockPrisma = {
    organization: delegate(),
    inspectionPlan: delegate(),
    assetNode: delegate(),
    finding: delegate(),
    visualInspection: delegate(),
    measurementRecord: delegate(),
    measurementSheetRecord: delegate(),
    standaloneMeasurement: delegate(),
    location: delegate(),
    user: delegate(),
    contactPerson: delegate(),
    photo: delegate(),
    contact: delegate(),
    project: delegate(),
    syncQueue: delegate(),
  };

  const mockNumbering = {
    runWithGeneratedNumber: jest.fn(
      async (_model: unknown, _org: unknown, _opts: unknown, create: any) =>
        create(mockPrisma, 'NODE-0001'),
    ),
  };

  const mockChat = {
    getSyncSnapshot: jest.fn(),
    applySyncMessage: jest.fn(),
    applySyncThread: jest.fn(),
    applySyncPresence: jest.fn(),
  };

  const mockAssetNodes = {
    assertNodeInPlanTree: jest.fn().mockResolvedValue({ id: 'node-a', nodeType: 'ASSET' }),
    assertDepthForWrite: jest.fn().mockResolvedValue(undefined),
  };

  // WP-C3 (B-218): submit-side-effects worden aan InspectionPlansService gedelegeerd.
  const mockInspectionPlans = {
    dispatchSubmitSideEffects: jest.fn().mockResolvedValue(undefined),
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  /** Plan-antwoord dat zowel de FK-org-check (orgId) als de model-load (template) bedient. */
  const planWithCriticalModel = {
    orgId: 'org-1',
    inspectionTemplate: {
      classificationModel: {
        characteristics: [
          {
            code: 'SEVERITY',
            options: [
              { code: 'C1', isCritical: true },
              { code: 'C3', isCritical: false },
            ],
          },
        ],
      },
    },
  };

  const findingCreate = (id: string, classificationValues: Record<string, string>) => ({
    operation: 'create',
    data: {
      id,
      assetNodeId: 'node-a',
      inspectionPlanId: 'p1',
      inspectionType: 'visual',
      shortDescription: 'x',
      classificationValues,
      // Client-poging om het server-owned veld te zetten — moet genegeerd worden.
      isCritical: false,
    },
  });

  /** Model-loads onderscheiden van FK-org-checks: alleen de load selecteert de template. */
  const modelLoadCalls = () =>
    mockPrisma.inspectionPlan.findUnique.mock.calls.filter(
      ([args]: any[]) => args?.select && 'inspectionTemplate' in args.select,
    );

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatSyncService, useValue: mockChat },
        { provide: NumberingService, useValue: mockNumbering },
        { provide: AssetNodesService, useValue: mockAssetNodes },
        { provide: InspectionPlansService, useValue: mockInspectionPlans },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);

    // Same-org FK-checks + model-load bedienen elkaar via dezelfde delegate.
    mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrisma.inspectionPlan.findUnique.mockResolvedValue(planWithCriticalModel);
    // Boom-check: plan zonder hoofdlocatie → membership-check wordt overgeslagen.
    mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
      id: 'p1',
      orgId: 'org-1',
      locationId: null,
    });
    mockPrisma.finding.findFirst.mockResolvedValue(null); // geen dup (idempotent-check)
    mockPrisma.finding.create.mockResolvedValue({ id: 'f1' });
    mockPrisma.finding.update.mockResolvedValue({ updatedAt: new Date() });
  });

  it('create: berekent isCritical server-side — de client-waarde wordt door de whitelist gedropt', async () => {
    const dto = {
      deviceId: 'dev-1',
      changes: { findings: [findingCreate('f1', { SEVERITY: 'C1' })] },
    } as any;

    const result = await service.push(user, dto);

    const createData = mockPrisma.finding.create.mock.calls[0][0].data;
    // Client stuurde isCritical: false, maar de berekende waarde (C1 → kritiek) wint.
    expect(createData.isCritical).toBe(true);
    expect(result.processed.findings).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('create: niet-kritieke classificatie → isCritical false', async () => {
    const dto = {
      deviceId: 'dev-1',
      changes: { findings: [findingCreate('f1', { SEVERITY: 'C3' })] },
    } as any;

    await service.push(user, dto);

    expect(mockPrisma.finding.create.mock.calls[0][0].data.isCritical).toBe(false);
  });

  it('update: heropen van een resolved+kritieke finding reset criticalRepairNotifiedAt', async () => {
    mockPrisma.finding.findFirst.mockResolvedValue({
      id: 'f1',
      orgId: 'org-1',
      inspectionPlanId: 'p1',
      statusCode: 'resolved',
      isCritical: true,
      updatedAt: new Date('2020-01-01'),
    });

    const dto = {
      deviceId: 'dev-1',
      changes: {
        findings: [
          {
            operation: 'update',
            data: { id: 'f1', statusCode: 'open', syncedAt: '2025-01-01T00:00:00Z' },
          },
        ],
      },
    } as any;

    const result = await service.push(user, dto);

    expect(mockPrisma.inspectionPlan.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', criticalRepairNotifiedAt: { not: null } },
      data: { criticalRepairNotifiedAt: null },
    });
    // Zonder classificationValues in de payload wordt het model niet geladen.
    expect(modelLoadCalls()).toHaveLength(0);
    expect(result.processed.findings).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('create: een nieuwe open+kritieke finding via de push her-armt de herinspectie-trigger (review #7)', async () => {
    const dto = {
      deviceId: 'dev-1',
      changes: { findings: [findingCreate('f1', { SEVERITY: 'C1' })] },
    } as any;

    await service.push(user, dto);

    expect(mockPrisma.inspectionPlan.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', criticalRepairNotifiedAt: { not: null } },
      data: { criticalRepairNotifiedAt: null },
    });
  });

  it('create: een niet-kritieke finding laat de trigger-timestamp met rust', async () => {
    const dto = {
      deviceId: 'dev-1',
      changes: { findings: [findingCreate('f1', { SEVERITY: 'C3' })] },
    } as any;

    await service.push(user, dto);

    expect(mockPrisma.inspectionPlan.updateMany).not.toHaveBeenCalled();
  });

  it('update: een LWW-conflict her-armt de trigger NIET (reset alleen ná een geslaagde write, review #5)', async () => {
    // Server nieuwer dan wat de client laatst zag → applyUpdate eindigt als
    // 'conflict' en schrijft niets weg; de stale statusCode:'open' van de PWA
    // mag criticalRepairNotifiedAt dan ook niet leegmaken.
    mockPrisma.finding.findFirst.mockResolvedValue({
      id: 'f1',
      orgId: 'org-1',
      inspectionPlanId: 'p1',
      statusCode: 'resolved',
      isCritical: true,
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    mockPrisma.syncQueue.findFirst.mockResolvedValue(null); // geen open conflict → create-pad
    mockPrisma.syncQueue.create.mockResolvedValue({ id: 'q1' });

    const dto = {
      deviceId: 'dev-1',
      changes: {
        findings: [
          {
            operation: 'update',
            data: { id: 'f1', statusCode: 'open', syncedAt: '2026-01-01T00:00:00Z' },
          },
        ],
      },
    } as any;

    const result = await service.push(user, dto);

    expect(result.conflicts).toHaveLength(1);
    expect(result.processed.findings).toBe(0);
    // Niets weggeschreven én geen trigger-reset.
    expect(mockPrisma.finding.update).not.toHaveBeenCalled();
    expect(mockPrisma.inspectionPlan.updateMany).not.toHaveBeenCalled();
  });

  it('update: heropen van een NIET-kritieke finding laat de timestamp met rust', async () => {
    mockPrisma.finding.findFirst.mockResolvedValue({
      id: 'f1',
      orgId: 'org-1',
      inspectionPlanId: 'p1',
      statusCode: 'resolved',
      isCritical: false,
      updatedAt: new Date('2020-01-01'),
    });

    const dto = {
      deviceId: 'dev-1',
      changes: {
        findings: [
          {
            operation: 'update',
            data: { id: 'f1', statusCode: 'open', syncedAt: '2025-01-01T00:00:00Z' },
          },
        ],
      },
    } as any;

    await service.push(user, dto);

    expect(mockPrisma.inspectionPlan.updateMany).not.toHaveBeenCalled();
  });

  it('per-push cache: twee findings van hetzelfde plan laden het classificatiemodel één keer', async () => {
    const dto = {
      deviceId: 'dev-1',
      changes: {
        findings: [
          findingCreate('f1', { SEVERITY: 'C1' }),
          findingCreate('f2', { SEVERITY: 'C3' }),
        ],
      },
    } as any;

    const result = await service.push(user, dto);

    expect(result.processed.findings).toBe(2);
    // De FK-org-check draait per finding; de model-load (select met
    // inspectionTemplate) maar één keer dankzij de per-push cache.
    expect(modelLoadCalls()).toHaveLength(1);
    expect(mockPrisma.finding.create.mock.calls[0][0].data.isCritical).toBe(true);
    expect(mockPrisma.finding.create.mock.calls[1][0].data.isCritical).toBe(false);
  });
});
