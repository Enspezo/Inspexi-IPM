import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { InspectionLocationsService } from './inspection-locations.service';
import { PrismaService } from '@/prisma';
import { LocationTypesService } from '../location-types/location-types.service';

describe('InspectionLocationsService', () => {
  let service: InspectionLocationsService;

  const mockPrismaService = {
    inspectionLocation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    asset: {
      updateMany: jest.fn(),
    },
    inspectionPlan: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLocationTypesService = {
    validateParentConstraint: jest.fn().mockResolvedValue({ valid: true }),
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
        InspectionLocationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LocationTypesService, useValue: mockLocationTypesService },
      ],
    }).compile();

    service = module.get<InspectionLocationsService>(InspectionLocationsService);

    // Sensible defaults
    mockLocationTypesService.validateParentConstraint.mockResolvedValue({ valid: true });
  });

  describe('findById', () => {
    it('should return the location when found in scope', async () => {
      const location = { id: 'loc-1', orgId: 'org-1', name: 'G1' };
      mockPrismaService.inspectionLocation.findFirst.mockResolvedValue(location);

      const result = await service.findById('loc-1', mockUser);

      expect(result).toBe(location);
      expect(mockPrismaService.inspectionLocation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'loc-1', orgId: 'org-1', deletedAt: null }),
        }),
      );
    });

    it('should throw NL NotFoundException when scoped out', async () => {
      mockPrismaService.inspectionLocation.findFirst.mockResolvedValue(null);

      await expect(service.findById('loc-x', mockUser)).rejects.toThrow(NotFoundException);
      await expect(service.findById('loc-x', mockUser)).rejects.toThrow('Locatie niet gevonden');
    });
  });

  describe('getCountByPlan', () => {
    it('should return the location count for a plan', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({ id: 'plan-1', orgId: 'org-1' });
      mockPrismaService.inspectionLocation.count.mockResolvedValue(5);

      const result = await service.getCountByPlan('plan-1', mockUser);

      expect(result).toEqual({ count: 5 });
      expect(mockPrismaService.inspectionLocation.count).toHaveBeenCalledWith({
        where: { inspectionPlanId: 'plan-1', deletedAt: null },
      });
    });
  });

  describe('create', () => {
    it('should create a location under a plan and call validateParentConstraint', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
      });
      mockPrismaService.inspectionLocation.aggregate.mockResolvedValue({
        _max: { sortOrder: 2 },
      });
      mockPrismaService.inspectionLocation.create.mockResolvedValue({
        id: 'loc-new',
        createdAt: new Date(),
      });

      const result = await service.create(
        'plan-1',
        mockUser,
        { locationType: 'gebouw', name: 'G1' } as any,
        'device-9',
      );

      expect(result.id).toBe('loc-new');
      expect(mockLocationTypesService.validateParentConstraint).toHaveBeenCalledWith(
        'gebouw',
        null,
        mockUser,
      );
      expect(mockPrismaService.inspectionLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            inspectionPlanId: 'plan-1',
            locationType: 'gebouw',
            name: 'G1',
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
      mockPrismaService.inspectionLocation.findFirst.mockResolvedValue({
        id: 'parent-1',
        locationType: 'ruimte',
      });
      mockLocationTypesService.validateParentConstraint.mockResolvedValue({
        valid: false,
        message: 'Type mag niet onder dit ouder-type',
      });

      await expect(
        service.create(
          'plan-1',
          mockUser,
          { locationType: 'gebouw', name: 'G1', parentLocationId: 'parent-1' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(
          'plan-1',
          mockUser,
          { locationType: 'gebouw', name: 'G1', parentLocationId: 'parent-1' } as any,
        ),
      ).rejects.toThrow('Type mag niet onder dit ouder-type');
      expect(mockPrismaService.inspectionLocation.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a scoped location', async () => {
      mockPrismaService.inspectionLocation.findFirst.mockResolvedValue({
        id: 'loc-1',
        orgId: 'org-1',
      });
      mockPrismaService.inspectionLocation.update.mockResolvedValue({
        id: 'loc-1',
        updatedAt: new Date(),
      });

      const result = await service.update('loc-1', mockUser, { name: 'Nieuw' } as any);

      expect(result.id).toBe('loc-1');
      expect(mockPrismaService.inspectionLocation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loc-1' },
          data: expect.objectContaining({ name: 'Nieuw' }),
        }),
      );
    });
  });

  describe('move', () => {
    it('should prevent circular nesting (descendant as new parent)', async () => {
      mockPrismaService.inspectionLocation.findFirst
        // location being moved
        .mockResolvedValueOnce({
          id: 'loc-1',
          orgId: 'org-1',
          locationType: 'gebouw',
          inspectionPlanId: 'plan-1',
        })
        // new parent lookup (within plan)
        .mockResolvedValueOnce({
          id: 'loc-2',
          locationType: 'ruimte',
          inspectionPlanId: 'plan-1',
        })
        // isDescendantOf: loc-2's parent is loc-1 → circular
        .mockResolvedValueOnce({ parentLocationId: 'loc-1' });

      await expect(
        service.move('loc-1', mockUser, { newParentId: 'loc-2' } as any),
      ).rejects.toThrow('Een locatie kan niet onder zijn eigen kind geplaatst worden');
      expect(mockPrismaService.inspectionLocation.update).not.toHaveBeenCalled();
    });

    it('should move to a valid new parent', async () => {
      mockPrismaService.inspectionLocation.findFirst
        .mockResolvedValueOnce({
          id: 'loc-1',
          orgId: 'org-1',
          locationType: 'gebouw',
          inspectionPlanId: 'plan-1',
        })
        .mockResolvedValueOnce({
          id: 'loc-2',
          locationType: 'ruimte',
          inspectionPlanId: 'plan-1',
        })
        // isDescendantOf: loc-2 has no parent → not circular
        .mockResolvedValueOnce({ parentLocationId: null });
      mockPrismaService.inspectionLocation.update.mockResolvedValue({
        id: 'loc-1',
        parentLocationId: 'loc-2',
        sortOrder: 0,
      });

      const result = await service.move('loc-1', mockUser, { newParentId: 'loc-2' } as any);

      expect(result.parentLocationId).toBe('loc-2');
      expect(mockPrismaService.inspectionLocation.update).toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('should reorder locations via a transaction', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({ id: 'plan-1', orgId: 'org-1' });
      mockPrismaService.inspectionLocation.update.mockImplementation((args) => args);
      mockPrismaService.$transaction.mockResolvedValue([]);

      const result = await service.reorder('plan-1', mockUser, {
        locationIds: ['loc-2', 'loc-1'],
      } as any);

      expect(result).toEqual({ reordered: true });
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.inspectionLocation.update).toHaveBeenCalledWith({
        where: { id: 'loc-2' },
        data: { sortOrder: 0 },
      });
      expect(mockPrismaService.inspectionLocation.update).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        data: { sortOrder: 1 },
      });
    });
  });

  describe('delete', () => {
    it('should soft-delete the location, its direct children and child assets', async () => {
      mockPrismaService.inspectionLocation.findFirst.mockResolvedValue({
        id: 'loc-1',
        orgId: 'org-1',
      });
      mockPrismaService.inspectionLocation.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaService.asset.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.delete('loc-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.inspectionLocation.updateMany).toHaveBeenCalledWith({
        where: { OR: [{ id: 'loc-1' }, { parentLocationId: 'loc-1' }] },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockPrismaService.asset.updateMany).toHaveBeenCalledWith({
        where: { locationId: 'loc-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
