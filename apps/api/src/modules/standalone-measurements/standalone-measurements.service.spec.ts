import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StandaloneMeasurementsService } from './standalone-measurements.service';
import { LookupService } from '../lookups/lookup.service';
import { PrismaService } from '@/prisma';

describe('StandaloneMeasurementsService', () => {
  let service: StandaloneMeasurementsService;

  const mockPrismaService = {
    standaloneMeasurement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    standaloneMeasurementValue: {
      create: jest.fn(),
    },
    inspectionPlan: {
      findFirst: jest.fn(),
    },
    inspectionLocation: {
      findUnique: jest.fn(),
    },
    asset: {
      findUnique: jest.fn(),
    },
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
        StandaloneMeasurementsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LookupService, useValue: mockLookupService },
      ],
    }).compile();

    service = module.get<StandaloneMeasurementsService>(StandaloneMeasurementsService);
  });

  describe('create', () => {
    it('should create a measurement with orgId taken from the plan and validate locationId', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
      });
      // assertSameOrg(inspectionLocation) → same org
      mockPrismaService.inspectionLocation.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.standaloneMeasurement.create.mockResolvedValue({
        id: 'm-new',
        createdAt: new Date(),
      });

      const result = await service.create(
        'plan-1',
        mockUser,
        { locationId: 'loc-1', measurementType: 'isolatiemeting' } as any,
        'device-9',
      );

      expect(result.id).toBe('m-new');
      expect(mockPrismaService.inspectionLocation.findUnique).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        select: { orgId: true },
      });
      expect(mockPrismaService.standaloneMeasurement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            inspectionPlanId: 'plan-1',
            locationId: 'loc-1',
            measurementType: 'isolatiemeting',
            createdBy: 'user-1',
            deviceId: 'device-9',
          }),
        }),
      );
    });

    it('should throw 404 when the plan is not in the org (getPlanInOrg)', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'plan-x',
          mockUser,
          { locationId: 'loc-1', measurementType: 'isolatiemeting' } as any,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.create(
          'plan-x',
          mockUser,
          { locationId: 'loc-1', measurementType: 'isolatiemeting' } as any,
        ),
      ).rejects.toThrow('Inspectieplan niet gevonden');
      expect(mockPrismaService.standaloneMeasurement.create).not.toHaveBeenCalled();
    });

    it('should reject a cross-tenant locationId (assertSameOrg → Forbidden)', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
      });
      // location belongs to another org
      mockPrismaService.inspectionLocation.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.create(
          'plan-1',
          mockUser,
          { locationId: 'loc-other', measurementType: 'isolatiemeting' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.standaloneMeasurement.create).not.toHaveBeenCalled();
    });

    it('should create nested values when provided', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
      });
      mockPrismaService.inspectionLocation.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.standaloneMeasurement.create.mockResolvedValue({ id: 'm-new' });

      await service.create('plan-1', mockUser, {
        locationId: 'loc-1',
        measurementType: 'isolatiemeting',
        values: [{ fieldName: 'r', fieldType: 'number', value: '230', unit: 'V' }],
      } as any);

      expect(mockPrismaService.standaloneMeasurement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            values: {
              create: [
                { fieldName: 'r', fieldType: 'number', value: '230', unit: 'V' },
              ],
            },
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return the measurement when found in scope', async () => {
      const measurement = { id: 'm-1', orgId: 'org-1' };
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue(measurement);

      const result = await service.findById('m-1', mockUser);

      expect(result).toBe(measurement);
      expect(mockPrismaService.standaloneMeasurement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'm-1', orgId: 'org-1', deletedAt: null }),
        }),
      );
    });

    it('should throw NL NotFoundException when scoped out', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue(null);

      await expect(service.findById('m-x', mockUser)).rejects.toThrow('Meting niet gevonden');
    });
  });

  describe('addValue', () => {
    it('should add a value to a scoped measurement', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
      });
      mockPrismaService.standaloneMeasurementValue.create.mockResolvedValue({ id: 'v-1' });

      const result = await service.addValue('m-1', mockUser, {
        fieldName: 'isolatieweerstand',
        fieldType: 'number',
        value: '500',
        unit: 'MOhm',
      } as any);

      expect(result.id).toBe('v-1');
      expect(mockPrismaService.standaloneMeasurementValue.create).toHaveBeenCalledWith({
        data: {
          standaloneMeasurementId: 'm-1',
          fieldName: 'isolatieweerstand',
          fieldType: 'number',
          value: '500',
          unit: 'MOhm',
        },
      });
    });

    it('should throw when the measurement is out of scope', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue(null);

      await expect(
        service.addValue('m-x', mockUser, {
          fieldName: 'x',
          fieldType: 'number',
          value: '1',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.standaloneMeasurementValue.create).not.toHaveBeenCalled();
    });

    it('validates passFailCode against the lookup and stores it', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
      });
      mockLookupService.resolveLookup.mockResolvedValue({ id: 'pf-1', code: 'pass' });
      mockPrismaService.standaloneMeasurementValue.create.mockResolvedValue({ id: 'v-2' });

      await service.addValue('m-1', mockUser, {
        fieldName: 'isolatieweerstand',
        fieldType: 'number',
        value: '500',
        unit: 'MOhm',
        passFailCode: 'pass',
      } as any);

      expect(mockLookupService.resolveLookup).toHaveBeenCalledWith(
        'pass-fail-status-types',
        'pass',
        'org-1',
      );
      expect(mockPrismaService.standaloneMeasurementValue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ passFailCode: 'pass' }),
      });
    });

    it('rejects an unknown passFailCode (BadRequest)', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
      });
      mockLookupService.resolveLookup.mockResolvedValue(null);

      await expect(
        service.addValue('m-1', mockUser, {
          fieldName: 'x',
          fieldType: 'number',
          value: '1',
          passFailCode: 'bogus',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.standaloneMeasurementValue.create).not.toHaveBeenCalled();
    });
  });

  describe('linkAsset', () => {
    it('should link an asset in the same org (assertSameOrg passes)', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
      });
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.standaloneMeasurement.update.mockResolvedValue({
        id: 'm-1',
        linkedAssetId: 'asset-1',
      });

      const result = await service.linkAsset('m-1', mockUser, { assetId: 'asset-1' } as any);

      expect(result.linkedAssetId).toBe('asset-1');
      expect(mockPrismaService.asset.findUnique).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        select: { orgId: true },
      });
      expect(mockPrismaService.standaloneMeasurement.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { linkedAssetId: 'asset-1' },
      });
    });

    it('should reject a cross-tenant assetId (assertSameOrg → Forbidden)', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
      });
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.linkAsset('m-1', mockUser, { assetId: 'asset-other' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.standaloneMeasurement.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft-delete the measurement via deletedAt', async () => {
      mockPrismaService.standaloneMeasurement.findFirst.mockResolvedValue({
        id: 'm-1',
        orgId: 'org-1',
      });
      mockPrismaService.standaloneMeasurement.update.mockResolvedValue({ id: 'm-1' });

      const result = await service.delete('m-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.standaloneMeasurement.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
