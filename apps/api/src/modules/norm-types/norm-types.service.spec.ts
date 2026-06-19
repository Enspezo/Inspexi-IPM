import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { NormTypesService } from './norm-types.service';
import { PrismaService } from '@/prisma';

describe('NormTypesService', () => {
  let service: NormTypesService;

  const mockPrismaService = {
    normTypeDefinition: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    classificationModel: {
      findUnique: jest.fn(),
    },
    inspectionPlan: { count: jest.fn() },
    inspectionTemplate: { count: jest.fn() },
    checklist: { count: jest.fn() },
    measurementSheetTemplate: { count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NormTypesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NormTypesService>(NormTypesService);
  });

  describe('findAll', () => {
    it('should default to active + non-deleted', async () => {
      mockPrismaService.normTypeDefinition.findMany.mockResolvedValue([]);

      await service.findAll();

      const call = mockPrismaService.normTypeDefinition.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.isActive).toBe(true);
      expect(call.orderBy).toEqual({ sortOrder: 'asc' });
    });

    it('should include inactive + deleted when requested', async () => {
      mockPrismaService.normTypeDefinition.findMany.mockResolvedValue([]);

      await service.findAll({ includeInactive: true, includeDeleted: true });

      const call = mockPrismaService.normTypeDefinition.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBeUndefined();
      expect(call.where.isActive).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should return the norm type when found', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
        id: 'nt-1',
        code: 'NEN1010',
        deletedAt: null,
      });

      const result = await service.findById('nt-1');

      expect(result.id).toBe('nt-1');
    });

    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue(null);

      await expect(service.findById('nope')).rejects.toThrow(
        new NotFoundException('Normtype niet gevonden'),
      );
    });

    it('should throw NotFoundException when soft-deleted', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
        id: 'nt-1',
        code: 'NEN1010',
        deletedAt: new Date(),
      });

      await expect(service.findById('nt-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByCode', () => {
    it('should return the norm type by code', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
        id: 'nt-1',
        code: 'NEN1010',
        deletedAt: null,
      });

      const result = await service.findByCode('NEN1010');

      expect(result.code).toBe('NEN1010');
    });

    it('should throw when not found', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue(null);

      await expect(service.findByCode('NOPE')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a norm type and stamp createdBy', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue(null);
      mockPrismaService.normTypeDefinition.create.mockResolvedValue({
        id: 'new-1',
        code: 'NEN1010',
      });

      const result = await service.create(
        { code: 'NEN1010', label: 'NEN 1010', assetTypes: [] } as any,
        'super-1',
      );

      expect(result.id).toBe('new-1');
      const data = mockPrismaService.normTypeDefinition.create.mock.calls[0][0].data;
      expect(data.createdBy).toBe('super-1');
      expect(data.code).toBe('NEN1010');
    });

    it('should reject a duplicate code', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
        id: 'existing',
        code: 'NEN1010',
      });

      await expect(
        service.create(
          { code: 'NEN1010', label: 'Dup', assetTypes: [] } as any,
          'super-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.normTypeDefinition.create).not.toHaveBeenCalled();
    });

    it('should reject an inactive classification model', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue(null);
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'cm-1',
        isActive: false,
      });

      await expect(
        service.create(
          {
            code: 'NEN1010',
            label: 'NEN 1010',
            assetTypes: [],
            classificationModelId: 'cm-1',
          } as any,
          'super-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.normTypeDefinition.create).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should block deletion when the code is in use', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
        id: 'nt-1',
        code: 'NEN1010',
        deletedAt: null,
      });
      mockPrismaService.inspectionPlan.count.mockResolvedValue(2);
      mockPrismaService.inspectionTemplate.count.mockResolvedValue(0);
      mockPrismaService.checklist.count.mockResolvedValue(0);
      mockPrismaService.measurementSheetTemplate.count.mockResolvedValue(0);

      await expect(service.softDelete('nt-1')).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.normTypeDefinition.update).not.toHaveBeenCalled();
    });

    it('should soft-delete when unused (sets deletedAt + isActive false)', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
        id: 'nt-1',
        code: 'NEN1010',
        deletedAt: null,
      });
      mockPrismaService.inspectionPlan.count.mockResolvedValue(0);
      mockPrismaService.inspectionTemplate.count.mockResolvedValue(0);
      mockPrismaService.checklist.count.mockResolvedValue(0);
      mockPrismaService.measurementSheetTemplate.count.mockResolvedValue(0);
      mockPrismaService.normTypeDefinition.update.mockResolvedValue({
        id: 'nt-1',
        deletedAt: new Date(),
      });

      await service.softDelete('nt-1');

      const data = mockPrismaService.normTypeDefinition.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.isActive).toBe(false);
    });
  });

  describe('restore', () => {
    it('should restore (deletedAt null + isActive true)', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
        id: 'nt-1',
        code: 'NEN1010',
        deletedAt: new Date(),
      });
      mockPrismaService.normTypeDefinition.update.mockResolvedValue({
        id: 'nt-1',
        deletedAt: null,
      });

      await service.restore('nt-1');

      const data = mockPrismaService.normTypeDefinition.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeNull();
      expect(data.isActive).toBe(true);
    });

    it('should throw when the norm type does not exist', async () => {
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue(null);

      await expect(service.restore('nope')).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.normTypeDefinition.update).not.toHaveBeenCalled();
    });
  });
});
