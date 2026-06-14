import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, FindingInspectionType } from '@prisma/client';
import { FindingsService } from './findings.service';
import { PrismaService } from '@/prisma';
import { LookupService } from '../lookups/lookup.service';

describe('FindingsService', () => {
  let service: FindingsService;

  const mockPrismaService = {
    finding: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    asset: { findFirst: jest.fn() },
    visualInspection: { findFirst: jest.fn() },
    measurementRecord: { findFirst: jest.fn() },
    findingTemplate: { findFirst: jest.fn() },
    photo: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
  };

  const mockLookupService = {
    resolveLookup: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FindingsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LookupService, useValue: mockLookupService },
      ],
    }).compile();

    service = module.get<FindingsService>(FindingsService);

    // Defaults for enrichment lookups
    mockPrismaService.photo.findMany.mockResolvedValue([]);
    mockPrismaService.user.findMany.mockResolvedValue([]);
  });

  describe('findAllByAsset', () => {
    it('should throw NotFoundException with NL message when asset not in org', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue(null);

      await expect(service.findAllByAsset('asset-x', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findAllByAsset('asset-x', mockUser)).rejects.toThrow(
        'Asset niet gevonden',
      );
    });

    it('should return findings for the asset', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue({ id: 'asset-1', orgId: 'org-1' });
      mockPrismaService.finding.findMany.mockResolvedValue([
        { id: 'f-1', assetId: 'asset-1', createdBy: null },
      ]);

      const result = await service.findAllByAsset('asset-1', mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('f-1');
      expect(result[0].photos).toEqual([]);
      expect(mockPrismaService.finding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assetId: 'asset-1', deletedAt: null }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should set statusCode "open" and capture deviceId', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue({ id: 'asset-1', orgId: 'org-1' });
      mockPrismaService.finding.create.mockResolvedValue({
        id: 'f-new',
        statusCode: 'open',
        classificationValues: {},
        createdAt: new Date(),
      });

      const result = await service.create(
        'asset-1',
        mockUser,
        { inspectionType: FindingInspectionType.visual, shortDescription: 'Test' } as any,
        'device-abc',
      );

      expect(result.statusCode).toBe('open');
      expect(mockPrismaService.finding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            assetId: 'asset-1',
            statusCode: 'open',
            createdBy: 'user-1',
            deviceId: 'device-abc',
          }),
        }),
      );
    });

    it('should throw NotFoundException when asset not in org', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'asset-x',
          mockUser,
          { inspectionType: FindingInspectionType.visual, shortDescription: 'Test' } as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should set resolvedAt + resolvedByUser when transitioning to resolved', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        statusCode: 'open',
      });
      mockLookupService.resolveLookup.mockResolvedValue({ code: 'resolved' });
      mockPrismaService.finding.update.mockResolvedValue({
        id: 'f-1',
        statusCode: 'resolved',
        resolvedAt: new Date(),
        classificationValues: {},
        updatedAt: new Date(),
      });

      await service.update('f-1', mockUser, {
        statusCode: 'resolved',
        resolutionNotes: 'Fixed',
      } as any);

      const updateCall = mockPrismaService.finding.update.mock.calls[0][0];
      expect(updateCall.data.statusCode).toBe('resolved');
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
      expect(updateCall.data.resolvedByUser).toEqual({ connect: { id: 'user-1' } });
      expect(updateCall.data.resolutionNotes).toBe('Fixed');
    });

    it('should NOT re-set resolvedAt when already resolved', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        statusCode: 'resolved',
      });
      mockLookupService.resolveLookup.mockResolvedValue({ code: 'resolved' });
      mockPrismaService.finding.update.mockResolvedValue({ id: 'f-1' });

      await service.update('f-1', mockUser, { statusCode: 'resolved' } as any);

      const updateCall = mockPrismaService.finding.update.mock.calls[0][0];
      expect(updateCall.data.resolvedAt).toBeUndefined();
      expect(updateCall.data.resolvedByUser).toBeUndefined();
    });

    it('should throw BadRequestException for unknown statusCode', async () => {
      mockPrismaService.finding.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        statusCode: 'open',
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
