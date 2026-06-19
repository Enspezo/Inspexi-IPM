import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AssetsService } from './assets.service';
import { PrismaService } from '@/prisma';
import { AssetTypesService } from '../asset-types/asset-types.service';
import { LookupService } from '../lookups/lookup.service';

describe('AssetsService', () => {
  let service: AssetsService;

  const mockPrismaService = {
    asset: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    inspectionPlan: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAssetTypesService = {
    validateParentConstraint: jest.fn().mockResolvedValue({ valid: true }),
  };

  const mockLookupService = {
    resolveLookup: jest.fn().mockResolvedValue({ code: 'new' }),
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
        AssetsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AssetTypesService, useValue: mockAssetTypesService },
        { provide: LookupService, useValue: mockLookupService },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);

    // Sensible defaults
    mockAssetTypesService.validateParentConstraint.mockResolvedValue({ valid: true });
    mockLookupService.resolveLookup.mockResolvedValue({ code: 'new' });
  });

  describe('findById', () => {
    it('should return the asset when found in scope', async () => {
      const asset = { id: 'asset-1', orgId: 'org-1', name: 'C1' };
      mockPrismaService.asset.findFirst.mockResolvedValue(asset);

      const result = await service.findById('asset-1', mockUser);

      expect(result).toBe(asset);
      expect(mockPrismaService.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'asset-1', orgId: 'org-1', deletedAt: null }),
        }),
      );
    });

    it('should throw NL NotFoundException when scoped out', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue(null);

      await expect(service.findById('asset-x', mockUser)).rejects.toThrow(NotFoundException);
      await expect(service.findById('asset-x', mockUser)).rejects.toThrow(
        'Asset niet gevonden',
      );
    });
  });

  describe('create', () => {
    it('should create an asset under a plan and call validateParentConstraint', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
      });
      mockPrismaService.asset.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrismaService.asset.create.mockResolvedValue({
        id: 'asset-new',
        statusCode: 'new',
        createdAt: new Date(),
      });

      const result = await service.create(
        'plan-1',
        mockUser,
        { assetType: 'container', name: 'C1' } as any,
        'device-9',
      );

      expect(result.id).toBe('asset-new');
      expect(mockAssetTypesService.validateParentConstraint).toHaveBeenCalledWith(
        'container',
        null,
        mockUser,
      );
      expect(mockPrismaService.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            inspectionPlanId: 'plan-1',
            assetType: 'container',
            name: 'C1',
            sortOrder: 3,
            createdBy: 'user-1',
            deviceId: 'device-9',
          }),
        }),
      );
    });

    it('should throw BadRequest when parent constraint is invalid', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
      });
      mockPrismaService.asset.findFirst.mockResolvedValue({
        id: 'parent-1',
        assetType: 'cabinet',
      });
      mockAssetTypesService.validateParentConstraint.mockResolvedValue({
        valid: false,
        message: 'Type mag niet onder dit ouder-type',
      });

      await expect(
        service.create(
          'plan-1',
          mockUser,
          { assetType: 'container', name: 'C1', parentAssetId: 'parent-1' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(
          'plan-1',
          mockUser,
          { assetType: 'container', name: 'C1', parentAssetId: 'parent-1' } as any,
        ),
      ).rejects.toThrow('Type mag niet onder dit ouder-type');
      expect(mockPrismaService.asset.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should validate statusCode via resolveLookup', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue({ id: 'asset-1', orgId: 'org-1' });
      mockPrismaService.asset.update.mockResolvedValue({
        id: 'asset-1',
        statusCode: 'in_progress',
        updatedAt: new Date(),
      });

      await service.update('asset-1', mockUser, { statusCode: 'in_progress' } as any);

      expect(mockLookupService.resolveLookup).toHaveBeenCalledWith(
        'asset-status-types',
        'in_progress',
        'org-1',
      );
      expect(mockPrismaService.asset.update).toHaveBeenCalled();
    });

    it('should throw BadRequest for an unknown statusCode', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue({ id: 'asset-1', orgId: 'org-1' });
      mockLookupService.resolveLookup.mockResolvedValue(null);

      await expect(
        service.update('asset-1', mockUser, { statusCode: 'bogus' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.asset.update).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('should prevent circular nesting (descendant as new parent)', async () => {
      mockPrismaService.asset.findFirst
        // asset being moved
        .mockResolvedValueOnce({
          id: 'asset-1',
          orgId: 'org-1',
          assetType: 'container',
          inspectionPlanId: 'plan-1',
        })
        // new parent lookup (within plan)
        .mockResolvedValueOnce({
          id: 'asset-2',
          assetType: 'cabinet',
          inspectionPlanId: 'plan-1',
        })
        // isDescendantOf: asset-2's parent is asset-1 → circular
        .mockResolvedValueOnce({ parentAssetId: 'asset-1' });

      await expect(
        service.move('asset-1', mockUser, { newParentId: 'asset-2' } as any),
      ).rejects.toThrow('Een asset kan niet onder zijn eigen kind geplaatst worden');
      expect(mockPrismaService.asset.update).not.toHaveBeenCalled();
    });

    it('should move to a valid new parent', async () => {
      mockPrismaService.asset.findFirst
        .mockResolvedValueOnce({
          id: 'asset-1',
          orgId: 'org-1',
          assetType: 'container',
          inspectionPlanId: 'plan-1',
        })
        .mockResolvedValueOnce({
          id: 'asset-2',
          assetType: 'cabinet',
          inspectionPlanId: 'plan-1',
        })
        // isDescendantOf: asset-2 has no parent → not circular
        .mockResolvedValueOnce({ parentAssetId: null });
      mockPrismaService.asset.update.mockResolvedValue({
        id: 'asset-1',
        parentAssetId: 'asset-2',
        sortOrder: 0,
      });

      const result = await service.move('asset-1', mockUser, { newParentId: 'asset-2' } as any);

      expect(result.parentAssetId).toBe('asset-2');
      expect(mockPrismaService.asset.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft-delete the asset and its direct children', async () => {
      mockPrismaService.asset.findFirst.mockResolvedValue({ id: 'asset-1', orgId: 'org-1' });
      mockPrismaService.asset.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.delete('asset-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.asset.updateMany).toHaveBeenCalledWith({
        where: { OR: [{ id: 'asset-1' }, { parentAssetId: 'asset-1' }] },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
