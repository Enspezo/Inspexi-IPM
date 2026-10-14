import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, Role, SyncStatus } from '@prisma/client';
import { SyncService } from './sync.service';
import { PrismaService } from '@/prisma';
import { ChatSyncService } from '../chat/chat-sync.service';
import { NumberingService } from '../numbering/numbering.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { InspectionPlansService } from '../inspection-plans/inspection-plans.service';
import { TimeEntriesService } from '../time-tracking/time-entries.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

describe('SyncService', () => {
  let service: SyncService;

  const delegate = () => ({
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  });

  const mockPrisma = {
    organization: delegate(),
    inspectionPlan: delegate(),
    // Unified asset tree: de 'assetNodes' sync-entiteit gebruikt de assetNode-delegate.
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
    measurementInstrument: delegate(),
    userDefaultInstrument: delegate(),
    inspectionPlanDefaultInstrument: delegate(),
    // WP-C3 (B-203): typeCode wordt nu tegen de type-definities gevalideerd —
    // default een systeem-def met shortcode zodat de happy-path creates slagen;
    // de typeCode-validatietests overriden dit per test.
    assetTypeDefinition: {
      ...delegate(),
      findMany: jest.fn().mockResolvedValue([{ orgId: null, shortCode: 'EI' }]),
    },
    locationTypeDefinition: {
      ...delegate(),
      findMany: jest.fn().mockResolvedValue([{ orgId: null, shortCode: 'GEB' }]),
    },
  };

  // Numbering-engine: voert de create-callback uit met een vast nodeNumber en geeft
  // `mockPrisma` als tx-client door (waar assetNode.create gemockt is).
  const mockNumbering = {
    runWithGeneratedNumber: jest.fn(
      async (_model: unknown, _org: unknown, _opts: unknown, create: any) =>
        create(mockPrisma, 'NODE-0001'),
    ),
  };

  // ChatService is delegated to for the additive chat sync; mock its snapshot/apply.
  const mockChat = {
    getSyncSnapshot: jest.fn().mockResolvedValue({
      chatThreads: [{ id: 't1', type: 'DIRECT' }],
      chatMessages: [{ id: 'm1', threadId: 't1', content: 'hi' }],
      deletedThreadIds: ['t-del'],
      deletedMessageIds: ['m-del'],
      users: [{ id: 'u1', availability: 'BESCHIKBAAR' }],
    }),
    applySyncMessage: jest.fn().mockResolvedValue({ id: 'm-new', status: 'success' }),
    applySyncThread: jest.fn().mockResolvedValue({ id: 't-new', status: 'success' }),
    applySyncPresence: jest.fn().mockResolvedValue({ id: 'user-1', status: 'success' }),
  };

  // AssetNodesService — assertNodeInPlanTree (boom-integriteit) en
  // assertDepthForWrite (WP-C3/B-216 dieptegrens). Default: alles toegestaan.
  const mockAssetNodes = {
    assertNodeInPlanTree: jest.fn().mockResolvedValue({ id: 'node-a', nodeType: 'ASSET' }),
    assertDepthForWrite: jest.fn().mockResolvedValue(undefined),
  };

  // WP-C3 (B-218): submit-side-effects worden aan InspectionPlansService gedelegeerd.
  const mockInspectionPlans = {
    dispatchSubmitSideEffects: jest.fn().mockResolvedValue(undefined),
  };

  // PRD-16 B1: urenregels in de push hangen achter het URENREGISTRATIE-entitlement.
  // Default: org heeft de add-on (assertFeature resolve't), zodat bestaande tests
  // ongemoeid blijven.
  const mockTimeEntries = { applySyncChange: jest.fn() };
  const mockEntitlements = { assertFeature: jest.fn().mockResolvedValue(undefined) };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;
  const superuser = { id: 'su', orgId: null, roles: [Role.SUPERUSER] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEntitlements.assertFeature.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatSyncService, useValue: mockChat },
        { provide: NumberingService, useValue: mockNumbering },
        { provide: AssetNodesService, useValue: mockAssetNodes },
        { provide: InspectionPlansService, useValue: mockInspectionPlans },
        { provide: TimeEntriesService, useValue: mockTimeEntries },
        { provide: EntitlementsService, useValue: mockEntitlements },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);

    // v4 (WP-D1): elke pull leest de open conflicten van de gebruiker —
    // default leeg zodat bestaande pull-tests niet op undefined.map stranden.
    mockPrisma.syncQueue.findMany.mockResolvedValue([]);
  });

  // ── PUSH: create ──────────────────────────────────────
  describe('push — create', () => {
    it('creates an inspection plan with injected orgId + createdBy', async () => {
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });
      // contactId is now org-validated on push (SYNC-2) — same-org contact.
      mockPrisma.contact.findUnique.mockResolvedValue({ orgId: 'org-1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', contactId: 'c1', projectName: 'X', normTypeCode: 'NEN1010' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'p1', orgId: 'org-1', createdBy: 'user-1' }),
        }),
      );
      expect(result.processed.inspectionPlans).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('creates an asset node with self-org + createdBy (org from self)', async () => {
      mockPrisma.assetNode.create.mockResolvedValue({ id: 'a1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'create', data: { id: 'a1', nodeType: 'ASSET', typeCode: 'electrical_installation', name: 'Board' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      // nodeNumber is server-toegekend via de numbering-engine (ASSET → ASSET_NODE-schema).
      expect(mockNumbering.runWithGeneratedNumber).toHaveBeenCalledWith(
        'ASSET_NODE',
        'org-1',
        expect.any(Object),
        expect.any(Function),
      );
      expect(mockPrisma.assetNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'a1', orgId: 'org-1', createdBy: 'user-1',
            typeCode: 'electrical_installation', nodeNumber: 'NODE-0001',
          }),
        }),
      );
      expect(result.processed.assetNodes).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('numbers a LOCATION asset node via the LOCATION_NODE scheme', async () => {
      mockPrisma.assetNode.create.mockResolvedValue({ id: 'loc1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'create', data: { id: 'loc1', nodeType: 'LOCATION', typeCode: 'gebouw', name: 'Verdieping 1' } },
          ],
        },
      } as any;

      await service.push(user, dto);

      expect(mockNumbering.runWithGeneratedNumber).toHaveBeenCalledWith(
        'LOCATION_NODE',
        'org-1',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('rejects an asset node whose parentId is in ANOTHER org (cross-tenant FK check)', async () => {
      // assertFkChecks → assertSameOrg(assetNode, parentId) → parent belongs to org-2.
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-2' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'create', data: { id: 'a1', parentId: 'parent-x', nodeType: 'ASSET', typeCode: 'x', name: 'Board' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.assetNode.create).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.processed.assetNodes).toBe(0);
    });

    it('rejects a finding whose assetNodeId is in ANOTHER org (cross-tenant FK check)', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-2' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          findings: [
            {
              operation: 'create',
              data: { id: 'f1', assetNodeId: 'node-b', inspectionPlanId: 'p1', inspectionType: 'visual', shortDescription: 'x' },
            },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.finding.create).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.processed.findings).toBe(0);
    });

    it('creates a visual inspection WITHOUT injecting createdBy (no createdBy column)', async () => {
      // Same-org FK checks pass.
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      // Plan zonder hoofdlocatie → boom-check wordt overgeslagen.
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1', locationId: null });
      mockPrisma.visualInspection.create.mockResolvedValue({ id: 'vi1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          visualInspections: [
            { operation: 'create', data: { id: 'vi1', assetNodeId: 'node-a', inspectionPlanId: 'p1', status: 'in_progress' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      const createArg = mockPrisma.visualInspection.create.mock.calls[0][0];
      expect(createArg.data).toEqual(
        expect.objectContaining({ id: 'vi1', orgId: 'org-1', assetNodeId: 'node-a', inspectionPlanId: 'p1' }),
      );
      expect(createArg.data).not.toHaveProperty('createdBy');
      expect(result.processed.visualInspections).toBe(1);
    });

    it('creates a standalone measurement with nested values (replace-on-write child)', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      // Plan zonder hoofdlocatie → boom-check wordt overgeslagen.
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1', locationId: null });
      mockPrisma.standaloneMeasurement.create.mockResolvedValue({ id: 'sm1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          standaloneMeasurements: [
            {
              operation: 'create',
              data: {
                id: 'sm1',
                inspectionPlanId: 'p1',
                locationNodeId: 'loc-1',
                measurementType: 'isolation',
                values: [
                  { fieldName: 'R_iso', fieldType: 'number', value: '500', unit: 'MΩ', passFailCode: 'pass', bogus: 'drop-me' },
                ],
              },
            },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      const createArg = mockPrisma.standaloneMeasurement.create.mock.calls[0][0];
      expect(createArg.data.values).toEqual({
        create: [{ fieldName: 'R_iso', fieldType: 'number', value: '500', unit: 'MΩ', passFailCode: 'pass' }],
      });
      expect(result.processed.standaloneMeasurements).toBe(1);
    });

    it('records an error when a create record is missing its id', async () => {
      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { projectName: 'No id' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('id');
    });
  });

  // ── PUSH: server-owned fields & integrity (M1/M2) ─────
  describe('push — server-owned fields & integrity (M1/M2)', () => {
    it('M1: ignores non-whitelisted fields, server-injects orgId', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null); // geen bestaand record (idempotent-check)
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            {
              operation: 'create',
              data: {
                id: 'p1', projectName: 'X', normTypeCode: 'NEN1010',
                // Vreemde/server-owned velden die de whitelist NIET mag doorlaten:
                orgId: 'EVIL-ORG', nodeNumber: 'HACK', path: 'a.b', depth: 5, bogusField: 'nope',
              },
            },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      const createArg = mockPrisma.inspectionPlan.create.mock.calls[0][0];
      expect(createArg.data.orgId).toBe('org-1'); // server-injected, niet de client-waarde
      expect(createArg.data).not.toHaveProperty('bogusField');
      expect(createArg.data).not.toHaveProperty('path');
      expect(createArg.data).not.toHaveProperty('depth');
      expect(createArg.data).not.toHaveProperty('nodeNumber');
      expect(result.processed.inspectionPlans).toBe(1);
    });

    it('M2: forces createdBy to the pushing user, ignoring the client value', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null); // geen bestaand record (idempotent-check)
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'X', createdBy: 'someone-else' } },
          ],
        },
      } as any;

      await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.create.mock.calls[0][0].data.createdBy).toBe('user-1');
    });

    it('M2: forces inspectorId to the pushing user on visual inspections', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1', locationId: null });
      mockPrisma.visualInspection.create.mockResolvedValue({ id: 'vi1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          visualInspections: [
            {
              operation: 'create',
              data: { id: 'vi1', assetNodeId: 'node-a', inspectionPlanId: 'p1', status: 'in_progress', inspectorId: 'ghost' },
            },
          ],
        },
      } as any;

      await service.push(user, dto);

      expect(mockPrisma.visualInspection.create.mock.calls[0][0].data.inspectorId).toBe('user-1');
    });

    it('M2: rejects a plan whose assignedTo user is in ANOTHER org (user-FK check)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ orgId: 'org-2' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'X', assignedTo: 'user-x' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.processed.inspectionPlans).toBe(0);
    });

    it('M2: accepts a plan whose installationResponsibleId is a same-org ContactPerson (not User)', async () => {
      // installationResponsibleId is een FK naar ContactPerson: valideer tegen dat
      // model, niet tegen User (anders faalt elke legitieme push met dit veld).
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null); // idempotent-check: nog niet aanwezig
      mockPrisma.contactPerson.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'X', installationResponsibleId: 'cp-1' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.contactPerson.findUnique).toHaveBeenCalledWith({
        where: { id: 'cp-1' },
        select: { orgId: true },
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled(); // niet tegen User
      expect(mockPrisma.inspectionPlan.create).toHaveBeenCalled();
      expect(result.processed.inspectionPlans).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('M2: rejects a plan whose installationResponsibleId ContactPerson is in ANOTHER org', async () => {
      mockPrisma.contactPerson.findUnique.mockResolvedValue({ orgId: 'org-2' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'X', installationResponsibleId: 'cp-x' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.processed.inspectionPlans).toBe(0);
    });

    it('M2: enforces assetNode tree membership on findings when the plan has a main location', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1', locationId: 'loc-root' });
      mockPrisma.finding.create.mockResolvedValue({ id: 'f1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          findings: [
            {
              operation: 'create',
              data: { id: 'f1', assetNodeId: 'node-a', inspectionPlanId: 'p1', inspectionType: 'visual', shortDescription: 'x' },
            },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockAssetNodes.assertNodeInPlanTree).toHaveBeenCalledWith(
        'node-a',
        expect.objectContaining({ id: 'p1', locationId: 'loc-root' }),
      );
      expect(result.processed.findings).toBe(1);
    });

    it('M2: rejects a finding whose node is not in the plan tree', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1', locationId: 'loc-root' });
      mockAssetNodes.assertNodeInPlanTree.mockRejectedValueOnce(
        new BadRequestException('De asset-node hoort niet bij de hoofdlocatie van dit inspectieplan'),
      );

      const dto = {
        deviceId: 'dev-1',
        changes: {
          findings: [
            {
              operation: 'create',
              data: { id: 'f1', assetNodeId: 'node-x', inspectionPlanId: 'p1', inspectionType: 'visual', shortDescription: 'x' },
            },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.finding.create).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.processed.findings).toBe(0);
    });

    it('M2/v4: an identical create-retry (lost push response) is a safe no-op success', async () => {
      // De eerdere push heeft de data al toegepast: serverstaat == payload.
      const dupUpdatedAt = new Date('2020-01-01');
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: dupUpdatedAt, projectName: 'Retry',
      });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'Retry' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      // No-op: niets geschreven, wél succes + de bestaande base-versie terug.
      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.processed.inspectionPlans).toBe(1);
      expect(result.conflicts).toHaveLength(0);
      expect(result.applied).toEqual([
        { entityType: 'inspectionPlan', entityId: 'p1', serverVersion: dupUpdatedAt.toISOString() },
      ]);
    });

    it('v4/B-209: an anchor-less create for an existing record with DIFFERENT content is a fail-closed conflict', async () => {
      // Het B-209-scenario: de PWA pusht een bestaand server-record (zonder
      // basis) als create, met offline gewijzigde inhoud. Vóór WP-D1 werd de
      // serverstaat hier stil overschreven.
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2020-01-01'), projectName: 'SERVERVERSIE',
      });
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);
      mockPrisma.syncQueue.create.mockResolvedValue({ id: 'q1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'CLIENTVERSIE' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual(
        expect.objectContaining({ entityType: 'inspectionPlan', entityId: 'p1' }),
      );
      expect(result.processed.inspectionPlans).toBe(0);
    });

    it('v4: a create-adoption WITH a fresh baseVersion applies as an idempotent update', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            {
              operation: 'create',
              data: { id: 'p1', projectName: 'Retry', baseVersion: '2025-01-01T00:00:00.000Z' },
            },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' } }),
      );
      expect(result.processed.inspectionPlans).toBe(1);
    });
  });

  // ── PUSH: update ──────────────────────────────────────
  describe('push — update', () => {
    it('updates a plan when there is no conflict', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'update', data: { id: 'p1', projectName: 'Y', syncedAt: '2025-01-01T00:00:00Z' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ syncedAt: expect.any(Date) }),
        }),
      );
      // syncedAt en updatedAt moeten uit exact dezelfde stempel komen — anders
      // stempelt @updatedAt ms later en geeft elke volgende push vanaf een vers
      // apparaat een vals zelf-conflict (ms-skew, ontdekt in WP-A1).
      const written = mockPrisma.inspectionPlan.update.mock.calls[0][0].data;
      expect(written.updatedAt).toBeInstanceOf(Date);
      expect(written.updatedAt).toEqual(written.syncedAt);
      expect(result.processed.inspectionPlans).toBe(1);
      expect(result.conflicts).toHaveLength(0);
    });

    it('records a conflict when the server is newer than the client', async () => {
      const serverUpdatedAt = new Date();
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: serverUpdatedAt,
      });
      // Geen open conflict aanwezig → create-pad (dedup: find-then-create).
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);
      mockPrisma.syncQueue.create.mockResolvedValue({ id: 'q1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'update', data: { id: 'p1', projectName: 'Y', syncedAt: '2020-01-01T00:00:00Z' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.syncQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SyncStatus.conflict }),
        }),
      );
      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.conflicts).toHaveLength(1);
      // Gat 1: het push-respons-conflict draagt de losse serverVersion (ISO updatedAt).
      expect(result.conflicts[0]).toEqual(
        expect.objectContaining({
          entityType: 'inspectionPlan',
          entityId: 'p1',
          serverVersion: serverUpdatedAt.toISOString(),
        }),
      );
    });

    it('dedupes: an existing open conflict row is updated, not re-created', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date(),
      });
      // Er bestaat al een open conflict → update-pad, geen tweede create.
      mockPrisma.syncQueue.findFirst.mockResolvedValue({ id: 'q-open' });
      mockPrisma.syncQueue.update.mockResolvedValue({ id: 'q-open' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'update', data: { id: 'p1', projectName: 'Y', syncedAt: '2020-01-01T00:00:00Z' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockPrisma.syncQueue.create).not.toHaveBeenCalled();
      expect(mockPrisma.syncQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'q-open' } }),
      );
      expect(result.conflicts).toHaveLength(1);
    });
  });

  // ── PUSH: v4-versieanker (WP-D1, besluit A1 — B-209) ──
  describe('push — v4 version anchor (fail-closed)', () => {
    const planUpdateData = (data: Record<string, unknown>) =>
      ({
        deviceId: 'dev-1',
        changes: { inspectionPlans: [{ operation: 'update', data: { id: 'p1', ...data } }] },
      }) as any;

    beforeEach(() => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);
      mockPrisma.syncQueue.create.mockResolvedValue({ id: 'q1' });
    });

    it('B-209: an update WITHOUT any anchor is a conflict (fail-closed), never a silent overwrite', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2020-01-01'), projectName: 'SERVERVERSIE',
      });

      const result = await service.push(user, planUpdateData({ projectName: 'CLIENTVERSIE' }));

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].serverVersion).toBe(new Date('2020-01-01').toISOString());
      // De conflictrij draagt de org-scoping voor de pull-envelope (B-223e).
      expect(mockPrisma.syncQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ orgId: 'org-1' }) }),
      );
    });

    it('an unparseable anchor counts as missing (fail-closed conflict)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2020-01-01'),
      });

      const result = await service.push(
        user,
        planUpdateData({ projectName: 'Y', baseVersion: 'geen-datum' }),
      );

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.conflicts).toHaveLength(1);
    });

    it('accepts a fresh v4 baseVersion (preferred over a stale legacy syncedAt)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2024-06-01T00:00:00.000Z'),
      });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });

      const result = await service.push(
        user,
        planUpdateData({
          projectName: 'Y',
          baseVersion: '2024-06-01T00:00:00.000Z', // exact de laatst geziene serverstaat
          syncedAt: '2020-01-01T00:00:00.000Z', // stale legacy-anker mag niet meetellen
        }),
      );

      expect(result.conflicts).toHaveLength(0);
      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalled();
      expect(result.processed.inspectionPlans).toBe(1);
    });

    it('detects a conflict on a stale baseVersion (server newer than the client base)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2024-06-02T00:00:00.000Z'),
      });

      const result = await service.push(
        user,
        planUpdateData({ projectName: 'Y', baseVersion: '2024-06-01T00:00:00.000Z' }),
      );

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.conflicts).toHaveLength(1);
    });

    it('returns the new server base per successful write under applied[] (create + update)', async () => {
      const createdAt = new Date('2026-01-01T10:00:00.000Z');
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce(null) // create: geen dup
        .mockResolvedValueOnce({ id: 'p2', orgId: 'org-1', updatedAt: new Date('2020-01-01') });
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p-new', updatedAt: createdAt });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p2' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p-new', projectName: 'Nieuw' } },
            {
              operation: 'update',
              data: { id: 'p2', projectName: 'Y', baseVersion: '2025-01-01T00:00:00.000Z' },
            },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(result.errors).toHaveLength(0);
      expect(result.applied).toHaveLength(2);
      expect(result.applied[0]).toEqual({
        entityType: 'inspectionPlan', entityId: 'p-new', serverVersion: createdAt.toISOString(),
      });
      // De update-versie is de gedeelde stempel die ook als updatedAt geschreven is.
      const written = mockPrisma.inspectionPlan.update.mock.calls[0][0].data;
      expect(result.applied[1]).toEqual({
        entityType: 'inspectionPlan', entityId: 'p2', serverVersion: written.updatedAt.toISOString(),
      });
    });

    it('conflict serverData never leaks internalNotes', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2020-01-01'),
        projectName: 'SERVERVERSIE', internalNotes: 'GEHEIM',
      });

      const result = await service.push(user, planUpdateData({ projectName: 'CLIENTVERSIE' }));

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].serverData).not.toHaveProperty('internalNotes');
      const queued = mockPrisma.syncQueue.create.mock.calls[0][0].data;
      expect((queued.conflictData as { serverData: Record<string, unknown> }).serverData)
        .not.toHaveProperty('internalNotes');
    });
  });

  // ── PUSH: vier-ogen-gate (PRD-13) ─────────────────────
  // Spiegel van de gate in inspection-plans.service.update(): ook via de
  // sync-push mag een plan niet naar completed/approved zonder review.
  // ── PUSH: urenregistratie-entitlement (PRD-16 · B1) ───
  describe('push — URENREGISTRATIE entitlement gate on time entries', () => {
    const forbidden = () =>
      new ForbiddenException({
        success: false,
        message: 'Urenregistratie zit niet in uw abonnement',
        code: 'FEATURE_NOT_IN_PLAN',
      });

    const pushWith = (extra: Record<string, unknown> = {}) =>
      ({
        deviceId: 'dev-1',
        changes: {
          timeEntries: [
            { operation: 'update', data: { id: 'te-1', activityType: 'REISTIJD' } },
            { operation: 'update', data: { id: 'te-2', activityType: 'UITVOERING' } },
          ],
          ...extra,
        },
      }) as any;

    it('applies time entries when the org has the add-on (gate checked once)', async () => {
      mockTimeEntries.applySyncChange
        .mockResolvedValueOnce({ id: 'te-1' })
        .mockResolvedValueOnce({ id: 'te-2' });

      const result = await service.push(user, pushWith());

      expect(result.processed.timeEntries).toBe(2);
      expect(result.errors).toHaveLength(0);
      // Eén resolver-aanroep per push, niet per record.
      expect(mockEntitlements.assertFeature).toHaveBeenCalledTimes(1);
      expect(mockEntitlements.assertFeature).toHaveBeenCalledWith(
        'org-1',
        'URENREGISTRATIE',
        expect.any(String),
      );
    });

    it('fails every time entry in errors[] without the add-on — never touches the service', async () => {
      mockEntitlements.assertFeature.mockRejectedValue(forbidden());

      const result = await service.push(user, pushWith());

      expect(mockTimeEntries.applySyncChange).not.toHaveBeenCalled();
      expect(result.processed.timeEntries).toBe(0);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map((e) => e.entityId)).toEqual(['te-1', 'te-2']);
      expect(result.errors[0].error).toContain('abonnement');
      expect(result.errors[0].entityType).toBe('timeEntry');
    });

    it('keeps processing the rest of the batch when the gate blocks time entries', async () => {
      mockEntitlements.assertFeature.mockRejectedValue(forbidden());
      // Geen bestaand plan → echt create-pad (isolatie van eerdere suites).
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null);
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });

      const result = await service.push(
        user,
        pushWith({
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'Keuring' } },
          ],
        }),
      );

      // Inspectiedata gaat gewoon door — geen harde 403 op de hele push.
      expect(mockPrisma.inspectionPlan.create).toHaveBeenCalled();
      expect(result.processed.inspectionPlans).toBe(1);
      expect(result.errors).toHaveLength(2);
    });

    it('does not consult the resolver when the batch carries no time entries', async () => {
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });

      await service.push(user, {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [{ operation: 'create', data: { id: 'p1', projectName: 'Keuring' } }],
        },
      } as any);

      expect(mockEntitlements.assertFeature).not.toHaveBeenCalled();
    });
  });

  describe('push — four-eyes gate on inspection plans', () => {
    const planUpdate = (statusCode: string) =>
      ({
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'update', data: { id: 'p1', statusCode, syncedAt: '2025-01-01T00:00:00Z' } },
          ],
        },
      }) as any;

    beforeEach(() => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', reviewedAt: null, updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });
    });

    it('rejects completed without review while the org toggle is on', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: true });

      const result = await service.push(user, planUpdate('completed'));

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('vier-ogen');
    });

    it('rejects approved without review as well (create-adoption path included)', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: true });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', statusCode: 'approved' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
    });

    it('allows completed when the plan is already reviewed (no org lookup)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', reviewedAt: new Date('2026-01-01'), updatedAt: new Date('2020-01-01'),
      });

      const result = await service.push(user, planUpdate('completed'));

      expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalled();
      expect(result.errors).toHaveLength(0);
    });

    it('allows completed without review when the org toggle is off', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: false });

      const result = await service.push(user, planUpdate('completed'));

      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalled();
      expect(result.errors).toHaveLength(0);
    });

    it('strips client-supplied reviewedAt/approvedAt (server-owned fields)', async () => {
      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            {
              operation: 'update',
              data: {
                id: 'p1',
                projectName: 'Y',
                reviewedAt: '2026-01-01T00:00:00Z',
                approvedAt: '2026-01-01T00:00:00Z',
                syncedAt: '2025-01-01T00:00:00Z',
              },
            },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      const updateData = mockPrisma.inspectionPlan.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('reviewedAt');
      expect(updateData).not.toHaveProperty('approvedAt');
      expect(result.errors).toHaveLength(0);
    });
  });

  // ── PUSH: delete ──────────────────────────────────────
  describe('push — delete', () => {
    it('soft-deletes an existing record then errors on a missing one', async () => {
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'p1', orgId: 'org-1' })
        .mockResolvedValueOnce(null);
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });

      const okDto = {
        deviceId: 'dev-1',
        changes: { inspectionPlans: [{ operation: 'delete', data: { id: 'p1' } }] },
      } as any;
      const okResult = await service.push(user, okDto);

      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
      expect(okResult.processed.inspectionPlans).toBe(1);

      const missingDto = {
        deviceId: 'dev-1',
        changes: { inspectionPlans: [{ operation: 'delete', data: { id: 'gone' } }] },
      } as any;
      const missingResult = await service.push(user, missingDto);

      expect(missingResult.errors).toHaveLength(1);
    });
  });

  // ── PUSH: superuser ───────────────────────────────────
  describe('push — superuser', () => {
    it('throws BadRequestException because a superuser has no org', async () => {
      const dto = { deviceId: 'dev-1', changes: {} } as any;
      await expect(service.push(superuser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ── RESOLVE ───────────────────────────────────────────
  describe('resolve', () => {
    const conflictQueueItem = {
      id: 'q1',
      payload: { id: 'p1', projectName: 'CLIENT' },
      conflictData: { serverData: { id: 'p1', projectName: 'SERVER' } },
      status: 'conflict',
    };

    // Nieuwe base-versie die de update-return draagt (gat 2: results[].serverVersion).
    const resolvedUpdatedAt = new Date('2026-02-02T00:00:00.000Z');

    it('applies the client version', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1' });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ updatedAt: resolvedUpdatedAt });
      mockPrisma.syncQueue.update.mockResolvedValue({ id: 'q1' });

      const dto = {
        deviceId: 'dev-1',
        resolutions: [{ entityType: 'inspectionPlan', entityId: 'p1', resolution: 'client' }],
      } as any;

      const result = await service.resolve(user, dto);

      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ projectName: 'CLIENT', syncedAt: expect.any(Date) }),
        }),
      );
      // Regressie: GEEN narrow select — de audit-middleware heeft het volledige
      // update-resultaat (incl. id/orgId) nodig voor een geldige audit-row.
      expect(mockPrisma.inspectionPlan.update.mock.calls[0][0].select).toBeUndefined();
      expect(mockPrisma.syncQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SyncStatus.completed }),
        }),
      );
      expect(result.resolved).toBe(1);
      // Gat 2: results[] draagt per opgelost item de nieuwe serverVersion.
      expect(result.results).toEqual([
        { entityType: 'inspectionPlan', entityId: 'p1', serverVersion: resolvedUpdatedAt.toISOString() },
      ]);
    });

    it('applies the server version', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1' });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ updatedAt: resolvedUpdatedAt });
      mockPrisma.syncQueue.update.mockResolvedValue({ id: 'q1' });

      const dto = {
        deviceId: 'dev-1',
        resolutions: [{ entityType: 'inspectionPlan', entityId: 'p1', resolution: 'server' }],
      } as any;

      await service.resolve(user, dto);

      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectName: 'SERVER' }),
        }),
      );
    });

    it('applies merged data', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1' });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ updatedAt: resolvedUpdatedAt });
      mockPrisma.syncQueue.update.mockResolvedValue({ id: 'q1' });

      const dto = {
        deviceId: 'dev-1',
        resolutions: [
          { entityType: 'inspectionPlan', entityId: 'p1', resolution: 'merge', mergedData: { projectName: 'MERGED' } },
        ],
      } as any;

      await service.resolve(user, dto);

      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectName: 'MERGED' }),
        }),
      );
    });

    it('rejects a merge that injects a cross-tenant FK (SYNC-1)', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1' });
      // The injected locationId belongs to another org → assertSameOrg throws.
      mockPrisma.location.findUnique.mockResolvedValue({ orgId: 'org-2' });

      const dto = {
        deviceId: 'dev-1',
        resolutions: [
          { entityType: 'inspectionPlan', entityId: 'p1', resolution: 'merge', mergedData: { locationId: 'foreign-loc' } },
        ],
      } as any;

      const result = await service.resolve(user, dto);

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.resolved).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('rejects a merge that bypasses the four-eyes review gate (SYNC-1)', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      // Existing plan not yet reviewed; org has the review gate enabled.
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1', reviewedAt: null });
      mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: true });

      const dto = {
        deviceId: 'dev-1',
        resolutions: [
          { entityType: 'inspectionPlan', entityId: 'p1', resolution: 'merge', mergedData: { statusCode: 'completed' } },
        ],
      } as any;

      const result = await service.resolve(user, dto);

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.resolved).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('records an error when there is no matching conflict', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);

      const dto = {
        deviceId: 'dev-1',
        resolutions: [{ entityType: 'inspectionPlan', entityId: 'p1', resolution: 'client' }],
      } as any;

      const result = await service.resolve(user, dto);

      expect(result.errors).toHaveLength(1);
      expect(result.resolved).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
    });

    it('never resolves a conflict for a record in another org (cross-tenant)', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      // Org-gescoped findFirst vindt het record niet (andere org) → geen mutatie.
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null);

      const dto = {
        deviceId: 'dev-1',
        resolutions: [{ entityType: 'inspectionPlan', entityId: 'p1', resolution: 'client' }],
      } as any;

      const result = await service.resolve(user, dto);

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(mockPrisma.syncQueue.update).not.toHaveBeenCalled();
      expect(result.resolved).toBe(0);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ── PULL ──────────────────────────────────────────────
  describe('pull', () => {
    it('returns grouped changes, strips internal fields and shapes photos/contacts', async () => {
      // changed plans (first call), deleted plans (second call)
      mockPrisma.inspectionPlan.findMany
        .mockResolvedValueOnce([{ id: 'p1', projectName: 'X', internalNotes: 'SECRET', orgId: 'org-1' }])
        .mockResolvedValueOnce([]);
      mockPrisma.assetNode.findMany.mockResolvedValue([]);
      mockPrisma.finding.findMany.mockResolvedValue([]);
      mockPrisma.visualInspection.findMany.mockResolvedValue([]);
      mockPrisma.measurementRecord.findMany.mockResolvedValue([]);
      mockPrisma.measurementSheetRecord.findMany.mockResolvedValue([]);
      mockPrisma.standaloneMeasurement.findMany.mockResolvedValue([]);
      mockPrisma.photo.findMany.mockResolvedValue([
        { id: 'ph1', entityType: 'inspection_plan', entityId: 'p1' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c1', orgId: 'org-1', companyName: 'Acme', firstName: null, lastName: null, type: 'COMPANY' },
      ]);
      // changed instruments (first call), tombstones (second call)
      mockPrisma.measurementInstrument.findMany
        .mockResolvedValueOnce([{ id: 'mi1', orgId: 'org-1', code: 'MM-001', brand: 'Fluke' }])
        .mockResolvedValueOnce([{ id: 'mi-del' }]);
      mockPrisma.userDefaultInstrument.findMany.mockResolvedValue([{ instrumentId: 'mi-fav' }]);
      mockPrisma.inspectionPlanDefaultInstrument.findMany.mockResolvedValue([
        { inspectionPlanId: 'p1', instrumentId: 'mi-plan' },
      ]);

      const result = await service.pull(user);

      // Pull-only meetmiddelen + voorkeuren + per-plan defaults + tombstones.
      expect(result.measurementInstruments).toEqual([
        { id: 'mi1', orgId: 'org-1', code: 'MM-001', brand: 'Fluke' },
      ]);
      expect(result.userDefaultInstrumentIds).toEqual(['mi-fav']);
      expect(result.inspectionPlans[0].defaultInstrumentIds).toEqual(['mi-plan']);
      expect(result.deletedIds.measurementInstruments).toEqual(['mi-del']);

      expect(result).toHaveProperty('inspectionPlans');
      expect(result).toHaveProperty('assetNodes');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('visualInspections');
      expect(result).toHaveProperty('measurementRecords');
      expect(result).toHaveProperty('measurementSheetRecords');
      expect(result).toHaveProperty('standaloneMeasurements');
      expect(result).toHaveProperty('photos');
      expect(result).toHaveProperty('contacts');
      expect(result).toHaveProperty('deletedIds');
      expect(result).toHaveProperty('contractVersion', 4);
      expect(result).toHaveProperty('openConflicts', []);
      expect(result).toHaveProperty('serverTime');

      // toWire strips internalNotes
      expect(result.inspectionPlans[0]).not.toHaveProperty('internalNotes');
      expect(result.inspectionPlans[0]).toHaveProperty('projectName', 'X');

      // photo entityType normalized + download url
      expect(result.photos[0].entityType).toBe('inspectionPlan');
      expect(result.photos[0].url).toBe('/api/v1/photos/ph1/download');

      // contact name derived from companyName
      expect(result.contacts[0].name).toBe('Acme');

      // serverTime is an ISO string
      expect(typeof result.serverTime).toBe('string');
      expect(new Date(result.serverTime).toISOString()).toBe(result.serverTime);
    });

    it('adds chat additively without changing existing keys/shape', async () => {
      mockPrisma.inspectionPlan.findMany.mockResolvedValue([]);
      mockPrisma.assetNode.findMany.mockResolvedValue([]);
      mockPrisma.finding.findMany.mockResolvedValue([]);
      mockPrisma.visualInspection.findMany.mockResolvedValue([]);
      mockPrisma.measurementRecord.findMany.mockResolvedValue([]);
      mockPrisma.measurementSheetRecord.findMany.mockResolvedValue([]);
      mockPrisma.standaloneMeasurement.findMany.mockResolvedValue([]);
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.measurementInstrument.findMany.mockResolvedValue([]);
      mockPrisma.userDefaultInstrument.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlanDefaultInstrument.findMany.mockResolvedValue([]);

      const result = await service.pull(user);

      // Existing contract keys remain present (v3: assets → assetNodes).
      for (const key of ['inspectionPlans', 'assetNodes', 'findings', 'photos', 'contacts', 'serverTime']) {
        expect(result).toHaveProperty(key);
      }
      expect(result.deletedIds).toHaveProperty('inspectionPlans');
      expect(result.deletedIds).toHaveProperty('assetNodes');
      expect(result.deletedIds).toHaveProperty('findings');
      expect(result.deletedIds).toHaveProperty('visualInspections');
      expect(result.deletedIds).toHaveProperty('standaloneMeasurements');

      // Additive meetmiddel keys (read-only referentie + voorkeuren + tombstones).
      expect(result).toHaveProperty('measurementInstruments');
      expect(result).toHaveProperty('userDefaultInstrumentIds');
      expect(result.deletedIds).toHaveProperty('measurementInstruments');

      // Additive chat keys.
      expect(result.chatThreads).toEqual([{ id: 't1', type: 'DIRECT' }]);
      expect(result.chatMessages).toEqual([{ id: 'm1', threadId: 't1', content: 'hi' }]);
      expect(result.users).toEqual([{ id: 'u1', availability: 'BESCHIKBAAR' }]);
      expect(result.deletedIds.chatThreads).toEqual(['t-del']);
      expect(result.deletedIds.chatMessages).toEqual(['m-del']);
    });

    it('v4/B-223e: delivers the FULL open-conflict set of this user, stripped and user-scoped', async () => {
      mockPrisma.inspectionPlan.findMany.mockResolvedValue([]);
      mockPrisma.assetNode.findMany.mockResolvedValue([]);
      mockPrisma.finding.findMany.mockResolvedValue([]);
      mockPrisma.visualInspection.findMany.mockResolvedValue([]);
      mockPrisma.measurementRecord.findMany.mockResolvedValue([]);
      mockPrisma.measurementSheetRecord.findMany.mockResolvedValue([]);
      mockPrisma.standaloneMeasurement.findMany.mockResolvedValue([]);
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.measurementInstrument.findMany.mockResolvedValue([]);
      mockPrisma.userDefaultInstrument.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlanDefaultInstrument.findMany.mockResolvedValue([]);

      const createdAt = new Date('2026-07-01T10:00:00.000Z');
      mockPrisma.syncQueue.findMany.mockResolvedValue([
        {
          entityType: 'assetNode',
          entityId: 'node-1',
          deviceId: 'dev-2',
          createdAt,
          conflictData: {
            serverVersion: '2026-07-01T09:00:00.000Z',
            serverData: { id: 'node-1', name: 'SERVERVERSIE', internalNotes: 'GEHEIM' },
            clientData: { id: 'node-1', name: 'CLIENTVERSIE' },
          },
        },
      ]);

      const result = await service.pull(user, '2026-07-27T00:00:00.000Z');

      // Bewust NIET since-gefilterd: altijd de volledige open set van de gebruiker.
      expect(mockPrisma.syncQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
            userId: 'user-1',
            status: SyncStatus.conflict,
          }),
        }),
      );
      expect(result.openConflicts).toEqual([
        {
          entityType: 'assetNode',
          entityId: 'node-1',
          deviceId: 'dev-2',
          conflictAt: createdAt.toISOString(),
          serverVersion: '2026-07-01T09:00:00.000Z',
          serverData: { id: 'node-1', name: 'SERVERVERSIE' }, // internalNotes gestript
          clientData: { id: 'node-1', name: 'CLIENTVERSIE' },
        },
      ]);
    });
  });

  // ── PUSH: chat (additive, delegated) ───────────────────
  describe('push — chat messages', () => {
    it('delegates chat messages to ChatService, not the generic mutator', async () => {
      const dto = {
        deviceId: 'dev-1',
        changes: {
          chatMessages: [
            { operation: 'create', data: { id: 'm1', threadId: 't1', content: 'hoi' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockChat.applySyncMessage).toHaveBeenCalledWith(
        user,
        'create',
        expect.objectContaining({ threadId: 't1', content: 'hoi' }),
      );
      expect(result.processed.chatMessages).toBe(1);
      // The generic mutator must be untouched by chat pushes.
      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
    });
  });

  describe('push — chat threads & presence', () => {
    it('delegates chat threads to ChatService and counts them', async () => {
      const dto = {
        deviceId: 'dev-1',
        changes: {
          chatThreads: [
            { operation: 'create', data: { id: 't1', type: 'DIRECT', userId: 'user-2' } },
          ],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockChat.applySyncThread).toHaveBeenCalledWith(
        user,
        'create',
        expect.objectContaining({ id: 't1', type: 'DIRECT', userId: 'user-2' }),
      );
      expect(result.processed.chatThreads).toBe(1);
      expect(result.errors).toEqual([]);
      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
    });

    it('delegates presence to ChatService (user from JWT, not payload)', async () => {
      const dto = {
        deviceId: 'dev-1',
        changes: {
          presence: [{ operation: 'update', data: { id: 'p1', availability: 'BEZIG' } }],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(mockChat.applySyncPresence).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ availability: 'BEZIG' }),
      );
      expect(result.processed.presence).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('processes threads before messages so a same-push thread exists for its messages', async () => {
      const order: string[] = [];
      mockChat.applySyncThread.mockImplementationOnce(async () => {
        order.push('thread');
        return { id: 't1', status: 'success' };
      });
      mockChat.applySyncMessage.mockImplementationOnce(async () => {
        order.push('message');
        return { id: 'm1', status: 'success' };
      });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          chatMessages: [{ operation: 'create', data: { id: 'm1', threadId: 't1', content: 'hoi' } }],
          chatThreads: [{ operation: 'create', data: { id: 't1', type: 'DIRECT', userId: 'user-2' } }],
        },
      } as any;

      await service.push(user, dto);

      expect(order).toEqual(['thread', 'message']);
    });

    it('reports a per-item error (entityType=chatThread) without aborting the push', async () => {
      mockChat.applySyncThread.mockRejectedValueOnce(new Error('Gebruiker niet gevonden'));

      const dto = {
        deviceId: 'dev-1',
        changes: {
          chatThreads: [{ operation: 'create', data: { id: 't-bad', type: 'DIRECT', userId: 'nope' } }],
          presence: [{ operation: 'update', data: { id: 'p1', availability: 'BEZIG' } }],
        },
      } as any;

      const result = await service.push(user, dto);

      expect(result.processed.chatThreads).toBe(0);
      expect(result.errors).toEqual([
        expect.objectContaining({ entityType: 'chatThread', entityId: 't-bad' }),
      ]);
      // A failing thread must not block presence (or anything after it).
      expect(result.processed.presence).toBe(1);
    });
  });

  // ── WP-C3 (B-203): typeCode-validatie + assigned nodeNumber ─────────────
  describe('push — typeCode validation & assigned nodeNumber (B-203)', () => {
    const nodeCreate = (typeCode: string) =>
      ({
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'create', data: { id: 'a1', nodeType: 'ASSET', typeCode, name: 'X' } },
          ],
        },
      }) as any;

    it('rejects an UNKNOWN typeCode with a Dutch message and never creates', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);
      mockPrisma.assetTypeDefinition.findMany.mockResolvedValueOnce([]); // geen match

      const result = await service.push(user, nodeCreate('bestaat_niet'));

      expect(mockPrisma.assetNode.create).not.toHaveBeenCalled();
      expect(mockNumbering.runWithGeneratedNumber).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Onbekend assettype "bestaat_niet"');
    });

    it('rejects an EMPTY typeCode', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);

      const result = await service.push(user, nodeCreate(''));

      expect(mockPrisma.assetNode.create).not.toHaveBeenCalled();
      expect(result.errors[0].error).toBe('Geen assettype opgegeven: kies een geldig type');
    });

    it('validates a LOCATION node against the location type definitions', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);
      mockPrisma.locationTypeDefinition.findMany.mockResolvedValueOnce([]);

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'create', data: { id: 'l1', nodeType: 'LOCATION', typeCode: 'spookruimte', name: 'X' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(result.errors[0].error).toBe('Onbekend locatietype "spookruimte"');
    });

    it('feeds the resolved shortCode into the numbering context (no loadContext round-trip)', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);
      mockPrisma.assetNode.create.mockResolvedValue({ id: 'a1', nodeNumber: 'NODE-0001' });

      await service.push(user, nodeCreate('electrical_installation'));

      expect(mockNumbering.runWithGeneratedNumber).toHaveBeenCalledWith(
        'ASSET_NODE',
        'org-1',
        { context: { typeShortCode: 'EI' } },
        expect.any(Function),
      );
    });

    it('returns the server-assigned nodeNumber under the additive assigned[] key (create)', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);
      mockPrisma.assetNode.create.mockResolvedValue({ id: 'a1', nodeNumber: 'NODE-0001' });

      const result = await service.push(user, nodeCreate('electrical_installation'));

      expect(result.errors).toHaveLength(0);
      expect(result.assigned).toEqual([
        { entityType: 'assetNode', entityId: 'a1', nodeNumber: 'NODE-0001' },
      ]);
    });

    it('returns the EXISTING nodeNumber on an idempotent create retry (adopt path)', async () => {
      // Retry van een create die eerder half slaagde: record bestaat al mét nummer
      // en met exact de eerder gepushte inhoud (v4: byte-identieke echo → no-op).
      mockPrisma.assetNode.findFirst.mockResolvedValue({
        id: 'a1', orgId: 'org-1', nodeType: 'ASSET', typeCode: 'electrical_installation',
        name: 'X', parentId: null,
        nodeNumber: 'EI-0007', updatedAt: new Date('2020-01-01'),
      });

      const result = await service.push(user, nodeCreate('electrical_installation'));

      expect(mockPrisma.assetNode.create).not.toHaveBeenCalled();
      // v4: geen write nodig (identieke echo), wél het bestaande nummer terug.
      expect(mockPrisma.assetNode.update).not.toHaveBeenCalled();
      expect(result.assigned).toEqual([
        { entityType: 'assetNode', entityId: 'a1', nodeNumber: 'EI-0007' },
      ]);
    });

    it('v4/B-209: an anchor-less node adopt with DIFFERENT content conflicts instead of overwriting', async () => {
      // Het letterlijke B-209-bewijs: "TP Onderverdeler B1 SERVERVERSIE" werd
      // door een anker-loze pseudo-create teruggezet naar de oude clientnaam.
      mockPrisma.assetNode.findFirst.mockResolvedValue({
        id: 'a1', orgId: 'org-1', nodeType: 'ASSET', typeCode: 'electrical_installation',
        name: 'TP Onderverdeler B1 SERVERVERSIE', parentId: null,
        nodeNumber: 'EI-0007', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);
      mockPrisma.syncQueue.create.mockResolvedValue({ id: 'q1' });

      const result = await service.push(user, nodeCreate('electrical_installation'));

      expect(mockPrisma.assetNode.update).not.toHaveBeenCalled();
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual(
        expect.objectContaining({ entityType: 'assetNode', entityId: 'a1' }),
      );
    });

    it('allows an UNCHANGED typeCode echo on update (legacy records keep syncing)', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue({
        id: 'a1', orgId: 'org-1', typeCode: 'legacy_type', parentId: null,
        nodeNumber: null, updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.assetNode.update.mockResolvedValue({ id: 'a1', updatedAt: new Date() });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'update', data: { id: 'a1', nodeType: 'ASSET', typeCode: 'legacy_type', name: 'Echo', syncedAt: '2025-01-01T00:00:00Z' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      // Echo = geen wijziging → geen type-lookup en geen fout.
      expect(mockPrisma.assetTypeDefinition.findMany).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(0);
      expect(result.processed.assetNodes).toBe(1);
    });

    it('rejects a typeCode CHANGE to an unknown type on update', async () => {
      mockPrisma.assetNode.findFirst.mockResolvedValue({
        id: 'a1', orgId: 'org-1', typeCode: 'electrical_installation', nodeType: 'ASSET', parentId: null,
        nodeNumber: 'EI-0001', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.assetTypeDefinition.findMany.mockResolvedValueOnce([]);

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'update', data: { id: 'a1', typeCode: 'onzin', syncedAt: '2025-01-01T00:00:00Z' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(mockPrisma.assetNode.update).not.toHaveBeenCalled();
      expect(result.errors[0].error).toBe('Onbekend assettype "onzin"');
    });
  });

  // ── WP-C3 (B-216): dieptegrens ──────────────────────────────────────────
  describe('push — depth limit (B-216)', () => {
    it('runs the depth guard for a child create', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' }); // parent same-org
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);
      mockPrisma.assetNode.create.mockResolvedValue({ id: 'a1', nodeNumber: 'NODE-0001' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'create', data: { id: 'a1', nodeType: 'ASSET', typeCode: 'electrical_installation', name: 'X', parentId: 'parent-1' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(mockAssetNodes.assertDepthForWrite).toHaveBeenCalledWith('parent-1', 'org-1');
      expect(result.errors).toHaveLength(0);
    });

    it('rejects the create when the depth guard throws (NL message)', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.assetNode.findFirst.mockResolvedValue(null);
      mockAssetNodes.assertDepthForWrite.mockRejectedValueOnce(
        new BadRequestException('Maximale nestdiepte (10) bereikt'),
      );

      const dto = {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'create', data: { id: 'a1', nodeType: 'ASSET', typeCode: 'electrical_installation', name: 'X', parentId: 'parent-1' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(mockPrisma.assetNode.create).not.toHaveBeenCalled();
      expect(result.errors[0].error).toBe('Maximale nestdiepte (10) bereikt');
    });

    it('runs the guard on a reparent (changed parentId) but not on an unchanged echo', async () => {
      mockPrisma.assetNode.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrisma.assetNode.findFirst.mockResolvedValue({
        id: 'a1', orgId: 'org-1', typeCode: 'electrical_installation', parentId: 'old-parent',
        nodeNumber: 'EI-0001', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.assetNode.update.mockResolvedValue({ id: 'a1', updatedAt: new Date() });

      // Echo: parentId ongewijzigd → geen dieptecheck.
      await service.push(user, {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'update', data: { id: 'a1', parentId: 'old-parent', syncedAt: '2025-01-01T00:00:00Z' } },
          ],
        },
      } as any);
      expect(mockAssetNodes.assertDepthForWrite).not.toHaveBeenCalled();

      // Reparent: gewijzigde parentId → move-variant van de check (met nodeId).
      await service.push(user, {
        deviceId: 'dev-1',
        changes: {
          assetNodes: [
            { operation: 'update', data: { id: 'a1', parentId: 'new-parent', syncedAt: '2025-01-01T00:00:00Z' } },
          ],
        },
      } as any);
      expect(mockAssetNodes.assertDepthForWrite).toHaveBeenCalledWith('new-parent', 'org-1', 'a1');
    });
  });

  // ── WP-C3 (B-217 / beslispunt A6-b): toewijzings-rolguard ───────────────
  describe('push — plan assignment role guard (B-217)', () => {
    const planner = { id: 'user-2', orgId: 'org-1', roles: [Role.WERKVOORBEREIDER] } as any;

    const planUpdate = (data: Record<string, unknown>) =>
      ({
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'update', data: { id: 'p1', syncedAt: '2025-01-01T00:00:00Z', ...data } },
          ],
        },
      }) as any;

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ orgId: 'org-1' }); // user-FK same-org
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', statusCode: 'in_progress',
        reviewerId: 'rev-1', assignedTo: 'user-9', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1', updatedAt: new Date() });
    });

    it('INSPECTEUR cannot CHANGE reviewerId (e.g. to himself)', async () => {
      const result = await service.push(user, planUpdate({ reviewerId: 'user-1' }));

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('management- of werkvoorbereidingsrollen');
    });

    it('INSPECTEUR cannot CHANGE assignedTo either', async () => {
      const result = await service.push(user, planUpdate({ assignedTo: 'user-1' }));

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
    });

    it('an UNCHANGED echo of reviewerId/assignedTo passes for INSPECTEUR (PWA pushes full records)', async () => {
      const result = await service.push(
        user,
        planUpdate({ reviewerId: 'rev-1', assignedTo: 'user-9', projectName: 'Echo' }),
      );

      expect(result.errors).toHaveLength(0);
      expect(result.processed.inspectionPlans).toBe(1);
    });

    it('WERKVOORBEREIDER (REVIEW_ROLES) may change the reviewer', async () => {
      const result = await service.push(planner, planUpdate({ reviewerId: 'rev-2' }));

      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.inspectionPlan.update).toHaveBeenCalled();
    });

    it('INSPECTEUR may self-assign a NEW plan (offline create, assignedTo === self)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null); // geen dup
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p-new' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p-new', projectName: 'Offline', assignedTo: 'user-1' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.inspectionPlan.create).toHaveBeenCalled();
    });

    it('INSPECTEUR may NOT assign a new plan to someone else', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null);

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p-new', projectName: 'Offline', assignedTo: 'user-5' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(mockPrisma.inspectionPlan.create).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
    });

    it('a conflict-bound stale update reports a CONFLICT, not a role failure', async () => {
      // Server is nieuwer dan de client-baseline → conflictpad; de rolguard
      // moet dat pad niet kapen (resolve() draait de guard alsnog).
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', statusCode: 'in_progress',
        reviewerId: 'rev-NEW', assignedTo: 'user-9', updatedAt: new Date(),
      });
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);
      mockPrisma.syncQueue.create.mockResolvedValue({ id: 'q1' });

      const result = await service.push(
        user,
        planUpdate({ reviewerId: 'rev-OLD', syncedAt: '2020-01-01T00:00:00Z' }),
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('resolve() enforces the role guard on the chosen data (no conflict-skip)', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue({
        id: 'q1',
        payload: { id: 'p1', reviewerId: 'user-1' },
        conflictData: { serverData: { id: 'p1' } },
        status: 'conflict',
      });
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', reviewerId: 'rev-1', assignedTo: 'user-9',
        statusCode: 'in_progress', updatedAt: new Date(),
      });

      const result = await service.resolve(user, {
        deviceId: 'dev-1',
        resolutions: [{ entityType: 'inspectionPlan', entityId: 'p1', resolution: 'client' }],
      } as any);

      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
      expect(result.resolved).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('management- of werkvoorbereidingsrollen');
    });
  });

  // ── WP-C3 (B-218): submit-side-effects via sync ─────────────────────────
  describe('push — submit side-effects on pending_review (B-218)', () => {
    const submitPush = (extra: Record<string, unknown> = {}) =>
      ({
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            {
              operation: 'update',
              data: { id: 'p1', statusCode: 'pending_review', syncedAt: '2025-01-01T00:00:00Z', ...extra },
            },
          ],
        },
      }) as any;

    beforeEach(() => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', statusCode: 'in_progress', submittedAt: null,
        reviewerId: null, assignedTo: 'user-1', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1', updatedAt: new Date() });
    });

    it('delegates to InspectionPlansService.dispatchSubmitSideEffects on in_progress → pending_review', async () => {
      const result = await service.push(user, submitPush());

      expect(result.errors).toHaveLength(0);
      expect(mockInspectionPlans.dispatchSubmitSideEffects).toHaveBeenCalledWith('p1', user);
    });

    it('fills submittedAt server-side when the client omitted it (same write, mirror of submit())', async () => {
      await service.push(user, submitPush());

      const written = mockPrisma.inspectionPlan.update.mock.calls[0][0].data;
      expect(written.submittedAt).toBeInstanceOf(Date);
    });

    it('keeps a client-supplied submittedAt untouched', async () => {
      await service.push(user, submitPush({ submittedAt: '2026-07-27T07:39:31.000Z' }));

      const written = mockPrisma.inspectionPlan.update.mock.calls[0][0].data;
      expect(written.submittedAt).toEqual(new Date('2026-07-27T07:39:31.000Z'));
    });

    it('does NOT fire on a pending_review echo (plan was already submitted)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', statusCode: 'pending_review', submittedAt: new Date(),
        reviewerId: null, assignedTo: 'user-1', updatedAt: new Date('2020-01-01'),
      });

      await service.push(user, submitPush());

      expect(mockInspectionPlans.dispatchSubmitSideEffects).not.toHaveBeenCalled();
    });

    it('fires on a create that arrives directly as pending_review (fully-offline submit)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null); // geen dup
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'Offline', statusCode: 'pending_review' } },
          ],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(result.errors).toHaveLength(0);
      expect(mockInspectionPlans.dispatchSubmitSideEffects).toHaveBeenCalledWith('p1', user);
    });

    it('a rejected side-effects promise never fails the push (fire-and-forget)', async () => {
      mockInspectionPlans.dispatchSubmitSideEffects.mockRejectedValueOnce(new Error('boom'));

      const result = await service.push(user, submitPush());

      expect(result.errors).toHaveLength(0);
      expect(result.processed.inspectionPlans).toBe(1);
    });

    it('does not fire when the status write conflicts (nothing applied)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', statusCode: 'in_progress', submittedAt: null,
        reviewerId: null, assignedTo: 'user-1', updatedAt: new Date(),
      });
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);
      mockPrisma.syncQueue.create.mockResolvedValue({ id: 'q1' });

      const result = await service.push(user, submitPush({ syncedAt: '2020-01-01T00:00:00Z' }));

      expect(result.conflicts).toHaveLength(1);
      expect(mockInspectionPlans.dispatchSubmitSideEffects).not.toHaveBeenCalled();
    });
  });

  // ── WP-C3 (B-212): NL-foutmapping in errors[] ───────────────────────────
  describe('push — error sanitation (B-212)', () => {
    it('maps a Prisma FK error (P2003) to Dutch without leaking path/payload', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null);
      // Rauwe Prisma-fout zoals in dev: pad + broncode + constraintnaam.
      mockPrisma.inspectionPlan.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          '\nInvalid `model.create()` invocation in\n/Users/mathijs/VIBE/InspeXi-Beheer-test/apps/api/src/modules/sync/sync.service.ts:546:19\nForeign key constraint violated: `imp_findings_visual_inspection_id_fkey (index)`',
          { code: 'P2003', clientVersion: '5.22.0' },
        ),
      );

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [{ operation: 'create', data: { id: 'p1', projectName: 'X' } }],
        },
      } as any;
      const result = await service.push(user, dto);

      expect(result.errors).toHaveLength(1);
      const msg = result.errors[0].error as string;
      expect(msg).toMatch(/^Verwijzing naar niet-bestaande gegevens \(referentie [0-9a-f-]+\)$/);
      expect(msg).not.toContain('/Users/');
      expect(msg).not.toContain('sync.service.ts');
      expect(msg).not.toContain('imp_findings');
    });

    it('keeps own NL HttpException messages as-is (no reference suffix)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null); // delete: record weg

      const dto = {
        deviceId: 'dev-1',
        changes: { inspectionPlans: [{ operation: 'delete', data: { id: 'gone' } }] },
      } as any;
      const result = await service.push(user, dto);

      expect(result.errors[0].error).toBe('Record niet gevonden');
    });
  });
});
