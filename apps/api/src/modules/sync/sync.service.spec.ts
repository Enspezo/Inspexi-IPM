import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Role, SyncStatus } from '@prisma/client';
import { SyncService } from './sync.service';
import { PrismaService } from '@/prisma';
import { ChatService } from '../chat/chat.service';

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
    inspectionPlan: delegate(),
    // Unified asset tree: de 'assetNodes' sync-entiteit gebruikt de assetNode-delegate.
    assetNode: delegate(),
    finding: delegate(),
    visualInspection: delegate(),
    measurementRecord: delegate(),
    measurementSheetRecord: delegate(),
    standaloneMeasurement: delegate(),
    location: delegate(),
    photo: delegate(),
    contact: delegate(),
    syncQueue: delegate(),
    measurementInstrument: delegate(),
    userDefaultInstrument: delegate(),
    inspectionPlanDefaultInstrument: delegate(),
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
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;
  const superuser = { id: 'su', orgId: null, roles: [Role.SUPERUSER] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatService, useValue: mockChat },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  // ── PUSH: create ──────────────────────────────────────
  describe('push — create', () => {
    it('creates an inspection plan with injected orgId + createdBy', async () => {
      mockPrisma.inspectionPlan.create.mockResolvedValue({ id: 'p1' });

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

      expect(mockPrisma.assetNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'a1', orgId: 'org-1', createdBy: 'user-1', typeCode: 'electrical_installation' }),
        }),
      );
      expect(result.processed.assetNodes).toBe(1);
      expect(result.errors).toHaveLength(0);
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
      expect(result.processed.inspectionPlans).toBe(1);
      expect(result.conflicts).toHaveLength(0);
    });

    it('records a conflict when the server is newer than the client', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'p1', orgId: 'org-1', updatedAt: new Date(),
      });
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

    it('applies the client version', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1' });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });
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
      expect(mockPrisma.syncQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SyncStatus.completed }),
        }),
      );
      expect(result.resolved).toBe(1);
    });

    it('applies the server version', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(conflictQueueItem);
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1' });
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });
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
      mockPrisma.inspectionPlan.update.mockResolvedValue({ id: 'p1' });
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

    it('records an error when there is no matching conflict', async () => {
      mockPrisma.syncQueue.findFirst.mockResolvedValue(null);

      const dto = {
        deviceId: 'dev-1',
        resolutions: [{ entityType: 'inspectionPlan', entityId: 'p1', resolution: 'client' }],
      } as any;

      const result = await service.resolve(user, dto);

      expect(result.errors).toHaveLength(1);
      expect(result.resolved).toBe(0);
      expect(mockPrisma.inspectionPlan.update).not.toHaveBeenCalled();
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
});
