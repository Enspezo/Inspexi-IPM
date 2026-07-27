import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Role, SyncStatus } from '@prisma/client';
import { SyncService } from './sync.service';
import { PrismaService } from '@/prisma';
import { ChatSyncService } from '../chat/chat-sync.service';
import { NumberingService } from '../numbering/numbering.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';

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
    assetTypeDefinition: { ...delegate(), findMany: jest.fn().mockResolvedValue([]) },
    locationTypeDefinition: { ...delegate(), findMany: jest.fn().mockResolvedValue([]) },
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

  // AssetNodesService — alleen assertNodeInPlanTree wordt door de sync gebruikt
  // (boom-integriteit). Default: node zit in de boom (resolve).
  const mockAssetNodes = {
    assertNodeInPlanTree: jest.fn().mockResolvedValue({ id: 'node-a', nodeType: 'ASSET' }),
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;
  const superuser = { id: 'su', orgId: null, roles: [Role.SUPERUSER] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatSyncService, useValue: mockChat },
        { provide: NumberingService, useValue: mockNumbering },
        { provide: AssetNodesService, useValue: mockAssetNodes },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
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

    it('M2: treats a create for an already-existing record as an idempotent update', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date('2020-01-01'),
      });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });

      const dto = {
        deviceId: 'dev-1',
        changes: {
          inspectionPlans: [
            { operation: 'create', data: { id: 'p1', projectName: 'Retry' } },
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

  // ── PUSH: vier-ogen-gate (PRD-13) ─────────────────────
  // Spiegel van de gate in inspection-plans.service.update(): ook via de
  // sync-push mag een plan niet naar completed/approved zonder review.
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
      expect(result).toHaveProperty('contractVersion', 3);
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
});
