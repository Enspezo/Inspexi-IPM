import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, InspectionExecStatus } from '@prisma/client';
import { MeasurementRecordsService } from './measurement-records.service';
import { PrismaService } from '@/prisma';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';

describe('MeasurementRecordsService', () => {
  let service: MeasurementRecordsService;

  const mockPrismaService = {
    measurementRecord: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assetNode: { findFirst: jest.fn() },
    inspectionPlan: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
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
        MeasurementRecordsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AssetNodesService, useValue: mockAssetNodesService },
      ],
    }).compile();

    service = module.get<MeasurementRecordsService>(MeasurementRecordsService);

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

  describe('findAllByAsset', () => {
    it('should throw NotFoundException with NL message when asset-node not in org', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.findAllByAsset('node-x', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findAllByAsset('node-x', mockUser)).rejects.toThrow(
        'Asset-node niet gevonden',
      );
    });

    it('should return measurement records for the asset-node', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'node-1', orgId: 'org-1' });
      mockPrismaService.measurementRecord.findMany.mockResolvedValue([
        { id: 'm-1', assetNodeId: 'node-1', inspectionPlanId: 'plan-1', status: InspectionExecStatus.not_started },
      ]);

      const result = await service.findAllByAsset('node-1', mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m-1');
      expect(mockPrismaService.measurementRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetNodeId: 'node-1' } }),
      );
    });
  });

  describe('create', () => {
    it('should set orgId from user, default status not_started, and capture deviceId', async () => {
      mockPrismaService.measurementRecord.create.mockResolvedValue({
        id: 'm-new',
        status: InspectionExecStatus.not_started,
        measurements: [],
        createdAt: new Date(),
      });

      const result = await service.create('node-1', mockUser, createDto(), 'device-abc');

      expect(result.status).toBe(InspectionExecStatus.not_started);
      expect(mockAssetNodesService.assertNodeInPlanTree).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ id: 'plan-1' }),
      );
      expect(mockPrismaService.measurementRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            assetNodeId: 'node-1',
            inspectionPlanId: 'plan-1',
            status: InspectionExecStatus.not_started,
            measurements: [],
            deviceId: 'device-abc',
          }),
        }),
      );
    });

    it('should convert calibrationDate string to a Date', async () => {
      mockPrismaService.measurementRecord.create.mockResolvedValue({ id: 'm-new' });

      await service.create('node-1', mockUser, createDto({ calibrationDate: '2026-01-15' }));

      const createCall = mockPrismaService.measurementRecord.create.mock.calls[0][0];
      expect(createCall.data.calibrationDate).toBeInstanceOf(Date);
      expect((createCall.data.calibrationDate as Date).toISOString()).toContain('2026-01-15');
    });

    it('should leave calibrationDate undefined when not provided', async () => {
      mockPrismaService.measurementRecord.create.mockResolvedValue({ id: 'm-new' });

      await service.create('node-1', mockUser, createDto());

      const createCall = mockPrismaService.measurementRecord.create.mock.calls[0][0];
      expect(createCall.data.calibrationDate).toBeUndefined();
    });

    it('should throw NotFoundException when the plan is not in org', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null);

      await expect(service.create('node-1', mockUser, createDto())).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.measurementRecord.create).not.toHaveBeenCalled();
    });

    it('should validate inspectorId against the user org (assertSameOrg)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.measurementRecord.create.mockResolvedValue({ id: 'm-new' });

      await service.create('node-1', mockUser, createDto({ inspectorId: 'insp-1' }));

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'insp-1' },
        select: { orgId: true },
      });
    });

    it('should throw ForbiddenException when inspectorId belongs to another org', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.create('node-1', mockUser, createDto({ inspectorId: 'insp-other' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when user has no org', async () => {
      const noOrgUser = { ...mockUser, orgId: null } as any;

      await expect(service.create('node-1', noOrgUser, createDto())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findById', () => {
    it('should return the record (including findings)', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
        findings: [],
      });

      const result = await service.findById('m-1', mockUser);

      expect(result.id).toBe('m-1');
      const call = mockPrismaService.measurementRecord.findFirst.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'm-1', orgId: 'org-1' });
      expect(call.include.findings).toBeDefined();
    });

    it('should throw NotFoundException for a missing record', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue(null);

      await expect(service.findById('nope', mockUser)).rejects.toThrow(NotFoundException);
      await expect(service.findById('nope', mockUser)).rejects.toThrow('Meting niet gevonden');
    });
  });

  describe('update', () => {
    it('should set null calibrationDate when explicitly cleared', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue({ id: 'm-1', orgId: 'org-1' });
      mockPrismaService.measurementRecord.update.mockResolvedValue({ id: 'm-1' });

      await service.update('m-1', mockUser, { calibrationDate: null } as any);

      const updateCall = mockPrismaService.measurementRecord.update.mock.calls[0][0];
      expect(updateCall.data.calibrationDate).toBeNull();
    });

    it('should pass status and measurements through', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue({ id: 'm-1', orgId: 'org-1' });
      mockPrismaService.measurementRecord.update.mockResolvedValue({ id: 'm-1' });

      await service.update('m-1', mockUser, {
        status: InspectionExecStatus.in_progress,
        measurements: [{ value: 1 }],
      } as any);

      const updateCall = mockPrismaService.measurementRecord.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(InspectionExecStatus.in_progress);
      expect(updateCall.data.measurements).toEqual([{ value: 1 }]);
    });

    it('should throw NotFoundException for a missing record', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue(null);

      await expect(service.update('nope', mockUser, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('start', () => {
    it('should set status in_progress, startedAt, and inspectorId when unset', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
        inspectorId: null,
      });
      mockPrismaService.measurementRecord.update.mockResolvedValue({
        id: 'm-1',
        status: InspectionExecStatus.in_progress,
      });

      await service.start('m-1', mockUser);

      const updateCall = mockPrismaService.measurementRecord.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(InspectionExecStatus.in_progress);
      expect(updateCall.data.startedAt).toBeInstanceOf(Date);
      expect(updateCall.data.inspectorId).toBe('user-1');
    });

    it('should keep the existing inspectorId on start', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
        inspectorId: 'insp-existing',
      });
      mockPrismaService.measurementRecord.update.mockResolvedValue({ id: 'm-1' });

      await service.start('m-1', mockUser);

      const updateCall = mockPrismaService.measurementRecord.update.mock.calls[0][0];
      expect(updateCall.data.inspectorId).toBe('insp-existing');
    });

    it('should throw NotFoundException for a missing record', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue(null);

      await expect(service.start('nope', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('complete', () => {
    it('should set status completed and completedAt', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue({ id: 'm-1', orgId: 'org-1' });
      mockPrismaService.measurementRecord.update.mockResolvedValue({
        id: 'm-1',
        status: InspectionExecStatus.completed,
      });

      await service.complete('m-1', mockUser);

      const updateCall = mockPrismaService.measurementRecord.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(InspectionExecStatus.completed);
      expect(updateCall.data.completedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException for a missing record', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue(null);

      await expect(service.complete('nope', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should hard-delete the record', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue({ id: 'm-1', orgId: 'org-1' });
      mockPrismaService.measurementRecord.delete.mockResolvedValue({});

      const result = await service.delete('m-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.measurementRecord.delete).toHaveBeenCalledWith({
        where: { id: 'm-1' },
      });
    });

    it('should throw NotFoundException for a missing record', async () => {
      mockPrismaService.measurementRecord.findFirst.mockResolvedValue(null);

      await expect(service.delete('nope', mockUser)).rejects.toThrow(NotFoundException);
    });
  });
});
