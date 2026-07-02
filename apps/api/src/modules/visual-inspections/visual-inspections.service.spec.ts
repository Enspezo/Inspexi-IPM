import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role, InspectionExecStatus } from '@prisma/client';
import { VisualInspectionsService } from './visual-inspections.service';
import { PrismaService } from '@/prisma';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';

describe('VisualInspectionsService', () => {
  let service: VisualInspectionsService;

  const mockPrismaService = {
    visualInspection: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assetNode: { findFirst: jest.fn() },
    inspectionPlan: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
  };

  const mockAssetNodesService = {
    assertNodeInPlanTree: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  const createDto = (overrides: Record<string, unknown> = {}) =>
    ({ inspectionPlanId: 'plan-1', ...overrides }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisualInspectionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AssetNodesService, useValue: mockAssetNodesService },
      ],
    }).compile();

    service = module.get<VisualInspectionsService>(VisualInspectionsService);

    mockAssetNodesService.assertNodeInPlanTree.mockResolvedValue({
      id: 'node-1',
      orgId: 'org-1',
      nodeType: 'ASSET',
    });
    mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
      id: 'plan-1',
      orgId: 'org-1',
      locationId: 'loc-1',
    });
  });

  describe('getAssetNodeInOrg (via findAllByAsset)', () => {
    it('should throw NotFoundException with NL message when asset-node not in org', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.findAllByAsset('node-x', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findAllByAsset('node-x', mockUser)).rejects.toThrow(
        'Asset-node niet gevonden',
      );
    });

    it('should org-scope the asset-node lookup', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'node-1', orgId: 'org-1' });
      mockPrismaService.visualInspection.findMany.mockResolvedValue([]);

      await service.findAllByAsset('node-1', mockUser);

      expect(mockPrismaService.assetNode.findFirst).toHaveBeenCalledWith({
        where: { id: 'node-1', orgId: 'org-1', deletedAt: null },
      });
      expect(mockPrismaService.visualInspection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetNodeId: 'node-1' } }),
      );
    });
  });

  describe('create', () => {
    it('should take orgId from the user, default status not_started, and capture deviceId', async () => {
      mockPrismaService.visualInspection.create.mockResolvedValue({
        id: 'vi-new',
        status: InspectionExecStatus.not_started,
        checklistResults: [],
        createdAt: new Date(),
      });

      const result = await service.create('node-1', mockUser, createDto(), 'device-abc');

      expect(result.status).toBe(InspectionExecStatus.not_started);
      expect(mockAssetNodesService.assertNodeInPlanTree).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ id: 'plan-1' }),
      );
      expect(mockPrismaService.visualInspection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            assetNodeId: 'node-1',
            inspectionPlanId: 'plan-1',
            status: InspectionExecStatus.not_started,
            checklistResults: [],
            deviceId: 'device-abc',
          }),
        }),
      );
    });

    it('should throw NotFoundException when the plan is not in org', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null);

      await expect(service.create('node-1', mockUser, createDto())).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.visualInspection.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user has no org', async () => {
      const superuser = { id: 'su', orgId: null, roles: [Role.SUPERUSER] } as any;

      await expect(service.create('node-1', superuser, createDto())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should pass inspectorId through assertSameOrg (same org → ok)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.visualInspection.create.mockResolvedValue({ id: 'vi-1' });

      await service.create('node-1', mockUser, createDto({ inspectorId: 'inspector-1' }));

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'inspector-1' },
        select: { orgId: true },
      });
      expect(mockPrismaService.visualInspection.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when inspectorId belongs to another org', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.create('node-1', mockUser, createDto({ inspectorId: 'inspector-x' })),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.visualInspection.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when inspectorId does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create('node-1', mockUser, createDto({ inspectorId: 'ghost' })),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when not in org', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue(null);

      await expect(service.findById('vi-x', mockUser)).rejects.toThrow(NotFoundException);
      await expect(service.findById('vi-x', mockUser)).rejects.toThrow(
        'Visuele inspectie niet gevonden',
      );
    });

    it('should org-scope the detail lookup (no deletedAt filter)', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue({ id: 'vi-1' });

      await service.findById('vi-1', mockUser);

      expect(mockPrismaService.visualInspection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'vi-1', orgId: 'org-1' } }),
      );
    });
  });

  describe('update', () => {
    it('should update status and checklistResults', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue({ id: 'vi-1', orgId: 'org-1' });
      mockPrismaService.visualInspection.update.mockResolvedValue({
        id: 'vi-1',
        status: InspectionExecStatus.in_progress,
      });

      await service.update('vi-1', mockUser, {
        status: InspectionExecStatus.in_progress,
        checklistResults: [{ q: 1 }],
      });

      const call = mockPrismaService.visualInspection.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'vi-1' });
      expect(call.data.status).toBe(InspectionExecStatus.in_progress);
      expect(call.data.checklistResults).toEqual([{ q: 1 }]);
    });

    it('should throw NotFoundException for missing inspection', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue(null);

      await expect(
        service.update('ghost', mockUser, { status: InspectionExecStatus.completed }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('start', () => {
    it('should set in_progress, startedAt, and assign inspector when none set', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue({
        id: 'vi-1',
        orgId: 'org-1',
        inspectorId: null,
      });
      mockPrismaService.visualInspection.update.mockResolvedValue({ id: 'vi-1' });

      await service.start('vi-1', mockUser);

      const call = mockPrismaService.visualInspection.update.mock.calls[0][0];
      expect(call.data.status).toBe(InspectionExecStatus.in_progress);
      expect(call.data.startedAt).toBeInstanceOf(Date);
      expect(call.data.inspector).toEqual({ connect: { id: 'user-1' } });
    });

    it('should NOT reassign inspector when one is already set', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue({
        id: 'vi-1',
        orgId: 'org-1',
        inspectorId: 'someone-else',
      });
      mockPrismaService.visualInspection.update.mockResolvedValue({ id: 'vi-1' });

      await service.start('vi-1', mockUser);

      const call = mockPrismaService.visualInspection.update.mock.calls[0][0];
      expect(call.data.inspector).toBeUndefined();
    });

    it('should throw NotFoundException for missing inspection', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue(null);

      await expect(service.start('ghost', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('complete', () => {
    it('should set completed and completedAt', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue({ id: 'vi-1', orgId: 'org-1' });
      mockPrismaService.visualInspection.update.mockResolvedValue({ id: 'vi-1' });

      await service.complete('vi-1', mockUser);

      const call = mockPrismaService.visualInspection.update.mock.calls[0][0];
      expect(call.data.status).toBe(InspectionExecStatus.completed);
      expect(call.data.completedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException for missing inspection', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue(null);

      await expect(service.complete('ghost', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should hard-delete the inspection', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue({ id: 'vi-1', orgId: 'org-1' });
      mockPrismaService.visualInspection.delete.mockResolvedValue({});

      const result = await service.delete('vi-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.visualInspection.delete).toHaveBeenCalledWith({
        where: { id: 'vi-1' },
      });
    });

    it('should throw NotFoundException for missing inspection', async () => {
      mockPrismaService.visualInspection.findFirst.mockResolvedValue(null);

      await expect(service.delete('ghost', mockUser)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.visualInspection.delete).not.toHaveBeenCalled();
    });
  });
});
