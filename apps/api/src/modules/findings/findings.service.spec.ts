import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, FindingInspectionType } from '@prisma/client';
import { FindingsService } from './findings.service';
import { PrismaService } from '@/prisma';
import { STATUS_OPEN, STATUS_RESOLVED } from '@/common';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { LookupService } from '../lookups/lookup.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';

describe('FindingsService', () => {
  let service: FindingsService;

  const mockPrismaService = {
    finding: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    assetNode: { findFirst: jest.fn() },
    inspectionPlan: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    visualInspection: { findFirst: jest.fn() },
    measurementRecord: { findFirst: jest.fn() },
    findingTemplate: { findFirst: jest.fn() },
    findingResolutionPhoto: { findFirst: jest.fn() },
    photo: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
  };

  const mockLookupService = {
    resolveLookup: jest.fn(),
  };

  const mockAssetNodesService = {
    assertNodeInPlanTree: jest.fn(),
  };

  const mockStorageProvider = {
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  const dtoBase = {
    inspectionPlanId: 'plan-1',
    inspectionType: FindingInspectionType.visual,
    shortDescription: 'Test',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FindingsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LookupService, useValue: mockLookupService },
        { provide: AssetNodesService, useValue: mockAssetNodesService },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
      ],
    }).compile();

    service = module.get<FindingsService>(FindingsService);

    // Defaults for enrichment lookups
    mockPrismaService.photo.findMany.mockResolvedValue([]);
    mockPrismaService.user.findMany.mockResolvedValue([]);
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
    // isCritical-berekening (PRD-14): default geen template/classificatiemodel.
    mockPrismaService.inspectionPlan.findUnique.mockResolvedValue({
      inspectionTemplate: null,
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

    it('should return findings for the asset-node', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'node-1', orgId: 'org-1' });
      mockPrismaService.finding.findMany.mockResolvedValue([
        { id: 'f-1', assetNodeId: 'node-1', inspectionPlanId: 'plan-1', createdBy: null, resolutions: [] },
      ]);

      const result = await service.findAllByAsset('node-1', mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('f-1');
      expect(result[0].photos).toEqual([]);
      expect(result[0].resolutions).toEqual([]);
      expect(mockPrismaService.finding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assetNodeId: 'node-1', deletedAt: null }),
        }),
      );
    });

    // PRD-14: resoluties gaan mee naar staf; foto's als download-URL, nooit als storage-key.
    it('should map resolution photos to staff download-URLs', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'node-1', orgId: 'org-1' });
      mockPrismaService.finding.findMany.mockResolvedValue([
        {
          id: 'f-1',
          assetNodeId: 'node-1',
          inspectionPlanId: 'plan-1',
          createdBy: null,
          resolutions: [
            {
              id: 'res-1',
              statusCode: 'REPORTED',
              description: 'Kabel vervangen',
              resolvedAt: new Date('2026-07-01T10:00:00Z'),
              photos: [{ id: 'photo-1', caption: null, uploadedAt: new Date() }],
              repairSession: {
                contactName: 'Jan Hersteller',
                companyName: 'Herstel BV',
                email: 'jan@herstel.nl',
                accessType: 'ANONYMOUS',
              },
            },
          ],
        },
      ]);

      const result = await service.findAllByAsset('node-1', mockUser);

      expect(result[0].resolutions).toHaveLength(1);
      expect(result[0].resolutions[0].statusCode).toBe('REPORTED');
      expect(result[0].resolutions[0].repairSession).toEqual(
        expect.objectContaining({ contactName: 'Jan Hersteller' }),
      );
      expect(result[0].resolutions[0].photos[0].url).toBe(
        '/api/v1/findings/resolution-photos/photo-1',
      );
    });
  });

  describe('getResolutionPhoto (PRD-14)', () => {
    it('streams the photo buffer org-scoped', async () => {
      mockPrismaService.findingResolutionPhoto.findFirst.mockResolvedValue({
        photoUrl: 'org-1/finding-photos/x.png',
      });
      mockStorageProvider.download.mockResolvedValue(Buffer.from('png-bytes'));

      const result = await service.getResolutionPhoto('photo-1', mockUser);

      expect(mockPrismaService.findingResolutionPhoto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'photo-1',
            resolution: { finding: { orgId: 'org-1', deletedAt: null } },
          }),
        }),
      );
      expect(result.mimeType).toBe('image/png');
      expect(result.buffer.toString()).toBe('png-bytes');
    });

    it('throws NotFoundException for a photo outside the org', async () => {
      mockPrismaService.findingResolutionPhoto.findFirst.mockResolvedValue(null);

      await expect(service.getResolutionPhoto('photo-x', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockStorageProvider.download).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should set statusCode "open" and capture deviceId', async () => {
      mockPrismaService.finding.create.mockResolvedValue({
        id: 'f-new',
        statusCode: STATUS_OPEN,
        classificationValues: {},
        createdAt: new Date(),
      });

      const result = await service.create(
        'node-1',
        mockUser,
        { ...dtoBase } as any,
        'device-abc',
      );

      expect(result.statusCode).toBe(STATUS_OPEN);
      expect(mockAssetNodesService.assertNodeInPlanTree).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ id: 'plan-1' }),
      );
      expect(mockPrismaService.finding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            assetNodeId: 'node-1',
            inspectionPlanId: 'plan-1',
            statusCode: STATUS_OPEN,
            createdBy: 'user-1',
            deviceId: 'device-abc',
          }),
        }),
      );
    });

    it('should throw NotFoundException when the plan is not in org', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.create('node-1', mockUser, { ...dtoBase } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.finding.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should set resolvedAt + resolvedByUser when transitioning to resolved', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        statusCode: STATUS_OPEN,
      });
      mockLookupService.resolveLookup.mockResolvedValue({ code: STATUS_RESOLVED });
      mockPrismaService.finding.update.mockResolvedValue({
        id: 'f-1',
        statusCode: STATUS_RESOLVED,
        resolvedAt: new Date(),
        classificationValues: {},
        updatedAt: new Date(),
      });

      await service.update('f-1', mockUser, {
        statusCode: STATUS_RESOLVED,
        resolutionNotes: 'Fixed',
      } as any);

      const updateCall = mockPrismaService.finding.update.mock.calls[0][0];
      expect(updateCall.data.statusCode).toBe(STATUS_RESOLVED);
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
      expect(updateCall.data.resolvedByUser).toEqual({ connect: { id: 'user-1' } });
      expect(updateCall.data.resolutionNotes).toBe('Fixed');
    });

    it('should NOT re-set resolvedAt when already resolved', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        statusCode: STATUS_RESOLVED,
      });
      mockLookupService.resolveLookup.mockResolvedValue({ code: STATUS_RESOLVED });
      mockPrismaService.finding.update.mockResolvedValue({ id: 'f-1' });

      await service.update('f-1', mockUser, { statusCode: STATUS_RESOLVED } as any);

      const updateCall = mockPrismaService.finding.update.mock.calls[0][0];
      expect(updateCall.data.resolvedAt).toBeUndefined();
      expect(updateCall.data.resolvedByUser).toBeUndefined();
    });

    it('should throw BadRequestException for unknown statusCode', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        statusCode: STATUS_OPEN,
      });
      mockLookupService.resolveLookup.mockResolvedValue(null);

      await expect(
        service.update('f-1', mockUser, { statusCode: 'bogus' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('f-1', mockUser, { statusCode: 'bogus' } as any),
      ).rejects.toThrow('Onbekende constatering-status: bogus');
    });

    it('should throw NotFoundException for missing finding', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', mockUser, { shortDescription: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // isCritical is server-owned (PRD-14): afgeleid van classificationValues × de
  // isCritical-vlaggen in het classificatiemodel van het plan.
  describe('isCritical (PRD-14)', () => {
    const criticalModelPlan = {
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

    describe('create', () => {
      beforeEach(() => {
        mockPrismaService.finding.create.mockResolvedValue({
          id: 'f-new',
          statusCode: STATUS_OPEN,
          classificationValues: {},
          createdAt: new Date(),
        });
      });

      it('zet isCritical true wanneer een classificatie-waarde een kritieke optie raakt', async () => {
        mockPrismaService.inspectionPlan.findUnique.mockResolvedValue(criticalModelPlan);

        await service.create(
          'node-1',
          mockUser,
          { ...dtoBase, classificationValues: { SEVERITY: 'C1' } } as any,
        );

        expect(mockPrismaService.inspectionPlan.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'plan-1' } }),
        );
        expect(mockPrismaService.finding.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isCritical: true }),
          }),
        );
      });

      it('zet isCritical false voor een niet-kritieke optie', async () => {
        mockPrismaService.inspectionPlan.findUnique.mockResolvedValue(criticalModelPlan);

        await service.create(
          'node-1',
          mockUser,
          { ...dtoBase, classificationValues: { SEVERITY: 'C3' } } as any,
        );

        expect(mockPrismaService.finding.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isCritical: false }),
          }),
        );
      });

      it('zet isCritical false wanneer het plan geen template/model heeft', async () => {
        mockPrismaService.inspectionPlan.findUnique.mockResolvedValue({
          inspectionTemplate: null,
        });

        await service.create(
          'node-1',
          mockUser,
          { ...dtoBase, classificationValues: { SEVERITY: 'C1' } } as any,
        );

        expect(mockPrismaService.finding.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isCritical: false }),
          }),
        );
      });
    });

    describe('update', () => {
      beforeEach(() => {
        mockPrismaService.finding.update.mockResolvedValue({
          id: 'f-1',
          classificationValues: {},
          statusCode: STATUS_OPEN,
          resolvedAt: null,
          updatedAt: new Date(),
        });
      });

      it('herberekent isCritical wanneer classificationValues wijzigen', async () => {
        mockPrismaService.finding.findFirst.mockResolvedValue({
          id: 'f-1',
          orgId: 'org-1',
          inspectionPlanId: 'plan-1',
          statusCode: STATUS_OPEN,
          isCritical: false,
        });
        mockPrismaService.inspectionPlan.findUnique.mockResolvedValue(criticalModelPlan);

        await service.update('f-1', mockUser, {
          classificationValues: { SEVERITY: 'C1' },
        } as any);

        expect(mockPrismaService.inspectionPlan.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'plan-1' } }),
        );
        const updateCall = mockPrismaService.finding.update.mock.calls[0][0];
        expect(updateCall.data.isCritical).toBe(true);
      });

      it('herberekent isCritical NIET zonder classificationValues in de PATCH', async () => {
        mockPrismaService.finding.findFirst.mockResolvedValue({
          id: 'f-1',
          orgId: 'org-1',
          inspectionPlanId: 'plan-1',
          statusCode: STATUS_OPEN,
          isCritical: true,
        });

        await service.update('f-1', mockUser, { shortDescription: 'x' } as any);

        expect(mockPrismaService.inspectionPlan.findUnique).not.toHaveBeenCalled();
        const updateCall = mockPrismaService.finding.update.mock.calls[0][0];
        expect(updateCall.data.isCritical).toBeUndefined();
      });

      it('heropen-reset: kritieke finding resolved → open maakt criticalRepairNotifiedAt leeg', async () => {
        mockPrismaService.finding.findFirst.mockResolvedValue({
          id: 'f-1',
          orgId: 'org-1',
          inspectionPlanId: 'plan-1',
          statusCode: STATUS_RESOLVED,
          isCritical: true,
        });
        mockLookupService.resolveLookup.mockResolvedValue({ code: STATUS_OPEN });

        await service.update('f-1', mockUser, { statusCode: STATUS_OPEN } as any);

        expect(mockPrismaService.inspectionPlan.updateMany).toHaveBeenCalledWith({
          where: { id: 'plan-1', criticalRepairNotifiedAt: { not: null } },
          data: { criticalRepairNotifiedAt: null },
        });
      });

      it('heropen-reset blijft uit voor een niet-kritieke finding', async () => {
        mockPrismaService.finding.findFirst.mockResolvedValue({
          id: 'f-1',
          orgId: 'org-1',
          inspectionPlanId: 'plan-1',
          statusCode: STATUS_RESOLVED,
          isCritical: false,
        });
        mockLookupService.resolveLookup.mockResolvedValue({ code: STATUS_OPEN });

        await service.update('f-1', mockUser, { statusCode: STATUS_OPEN } as any);

        expect(mockPrismaService.inspectionPlan.updateMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('delete', () => {
    it('should soft-delete by setting deletedAt', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue({ id: 'f-1', orgId: 'org-1' });
      mockPrismaService.finding.update.mockResolvedValue({});

      const result = await service.delete('f-1', mockUser);

      expect(result).toEqual({ deleted: true });
      const updateCall = mockPrismaService.finding.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'f-1' });
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException for missing finding', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue(null);

      await expect(service.delete('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
