import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ClassificationModelsService } from './classification-models.service';
import { PrismaService } from '@/prisma';

describe('ClassificationModelsService', () => {
  let service: ClassificationModelsService;

  const mockPrismaService = {
    classificationModel: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    classificationCharacteristic: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    classificationOption: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    findingTemplate: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Supports both array-of-promises (reorder) and callback (delete) forms.
    mockPrismaService.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(mockPrismaService) : Promise.all(arg),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassificationModelsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ClassificationModelsService>(ClassificationModelsService);
  });

  describe('findById', () => {
    it('should return the model when found', async () => {
      const model = { id: 'm-1', code: 'NEN1010', _count: { findingTemplates: 0 } };
      mockPrismaService.classificationModel.findUnique.mockResolvedValue(model);

      const result = await service.findById('m-1');

      expect(result.id).toBe('m-1');
    });

    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue(null);

      await expect(service.findById('nope')).rejects.toThrow(
        new NotFoundException('Classificatiemodel niet gevonden'),
      );
    });
  });

  describe('create', () => {
    it('should create a model with nested characteristics + options', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue(null);
      mockPrismaService.classificationModel.create.mockResolvedValue({
        id: 'm-new',
        code: 'NEN1010',
      });

      const result = await service.create(
        {
          code: 'NEN1010',
          name: 'NEN 1010',
          characteristics: [
            {
              code: 'STATUS',
              name: 'Status',
              options: [{ code: 'OK', name: 'Goed', color: '#16A34A' }],
            },
          ],
        } as any,
        'user-1',
      );

      expect(result.id).toBe('m-new');
      const data = mockPrismaService.classificationModel.create.mock.calls[0][0].data;
      expect(data.createdBy).toBe('user-1');
      expect(data.characteristics.create[0].code).toBe('STATUS');
      expect(data.characteristics.create[0].sortOrder).toBe(1);
      expect(data.characteristics.create[0].options.create[0].code).toBe('OK');
      expect(data.characteristics.create[0].options.create[0].sortOrder).toBe(1);
    });

    it('should reject a duplicate code', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'existing',
        code: 'NEN1010',
      });

      await expect(
        service.create(
          { code: 'NEN1010', name: 'Dup', characteristics: [] } as any,
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.classificationModel.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should block deactivation when templates use the model', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'm-1',
        _count: { findingTemplates: 3 },
      });

      await expect(
        service.update('m-1', { isActive: false } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.classificationModel.update).not.toHaveBeenCalled();
    });
  });

  describe('addCharacteristic', () => {
    it('should add a characteristic with the next sortOrder', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'm-1',
        _count: { findingTemplates: 0 },
      });
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue(null);
      mockPrismaService.classificationCharacteristic.aggregate.mockResolvedValue({
        _max: { sortOrder: 2 },
      });
      mockPrismaService.classificationCharacteristic.create.mockResolvedValue({
        id: 'char-new',
        code: 'STATUS',
      });

      const result = await service.addCharacteristic('m-1', {
        code: 'STATUS',
        name: 'Status',
      } as any);

      expect(result.id).toBe('char-new');
      const data = mockPrismaService.classificationCharacteristic.create.mock.calls[0][0].data;
      expect(data.sortOrder).toBe(3);
      expect(data.classificationModelId).toBe('m-1');
    });

    it('should reject a duplicate characteristic code', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'm-1',
        _count: { findingTemplates: 0 },
      });
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue({
        id: 'existing',
        code: 'STATUS',
      });

      await expect(
        service.addCharacteristic('m-1', { code: 'STATUS', name: 'Dup' } as any),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.classificationCharacteristic.create).not.toHaveBeenCalled();
    });
  });

  describe('addOption', () => {
    it('should add an option with the next sortOrder', async () => {
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue({
        id: 'char-1',
      });
      mockPrismaService.classificationOption.findUnique.mockResolvedValue(null);
      mockPrismaService.classificationOption.aggregate.mockResolvedValue({
        _max: { sortOrder: 0 },
      });
      mockPrismaService.classificationOption.create.mockResolvedValue({
        id: 'opt-new',
        code: 'OK',
      });

      const result = await service.addOption('char-1', {
        code: 'OK',
        name: 'Goed',
        color: '#16A34A',
      } as any);

      expect(result.id).toBe('opt-new');
      const data = mockPrismaService.classificationOption.create.mock.calls[0][0].data;
      expect(data.sortOrder).toBe(1);
      expect(data.characteristicId).toBe('char-1');
    });

    it('should throw when the characteristic is missing', async () => {
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue(null);

      await expect(
        service.addOption('nope', { code: 'OK', name: 'Goed', color: '#16A34A' } as any),
      ).rejects.toThrow(new NotFoundException('Kenmerk niet gevonden'));
    });
  });

  describe('reorderCharacteristics', () => {
    it('should update sortOrder by index in a transaction', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'm-1',
        _count: { findingTemplates: 0 },
      });
      mockPrismaService.classificationCharacteristic.update.mockResolvedValue({});

      await service.reorderCharacteristics('m-1', ['c-2', 'c-1']);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.classificationCharacteristic.update).toHaveBeenCalledWith({
        where: { id: 'c-2' },
        data: { sortOrder: 1 },
      });
      expect(mockPrismaService.classificationCharacteristic.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { sortOrder: 2 },
      });
    });
  });

  describe('reorderOptions', () => {
    it('should update option sortOrder by index in a transaction', async () => {
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue({
        id: 'char-1',
      });
      mockPrismaService.classificationOption.update.mockResolvedValue({});

      await service.reorderOptions('char-1', ['o-2', 'o-1']);

      expect(mockPrismaService.classificationOption.update).toHaveBeenCalledWith({
        where: { id: 'o-2' },
        data: { sortOrder: 1 },
      });
      expect(mockPrismaService.classificationOption.update).toHaveBeenCalledWith({
        where: { id: 'o-1' },
        data: { sortOrder: 2 },
      });
    });
  });

  describe('deleteCharacteristic', () => {
    it('should return a warning when templates use the characteristic and not acknowledged', async () => {
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue({
        id: 'char-1',
        code: 'STATUS',
        classificationModel: {
          findingTemplates: [{ id: 't-1', defaultClassification: { STATUS: 'OK' } }],
        },
      });

      const result = await service.deleteCharacteristic('char-1', false);

      expect(result).toEqual(
        expect.objectContaining({ warning: true, affectedTemplates: 1 }),
      );
      expect(mockPrismaService.classificationCharacteristic.delete).not.toHaveBeenCalled();
    });

    it('should delete and clear template defaults when acknowledged', async () => {
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue({
        id: 'char-1',
        code: 'STATUS',
        classificationModel: {
          findingTemplates: [{ id: 't-1', defaultClassification: { STATUS: 'OK' } }],
        },
      });
      mockPrismaService.findingTemplate.update.mockResolvedValue({});
      mockPrismaService.classificationCharacteristic.delete.mockResolvedValue({});

      const result = await service.deleteCharacteristic('char-1', true);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.findingTemplate.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { defaultClassification: {} },
      });
      expect(mockPrismaService.classificationCharacteristic.delete).toHaveBeenCalledWith({
        where: { id: 'char-1' },
      });
    });

    it('should throw when the characteristic is missing', async () => {
      mockPrismaService.classificationCharacteristic.findUnique.mockResolvedValue(null);

      await expect(service.deleteCharacteristic('nope')).rejects.toThrow(
        new NotFoundException('Kenmerk niet gevonden'),
      );
    });
  });

  describe('deleteOption', () => {
    it('should delete an option not used by any template', async () => {
      mockPrismaService.classificationOption.findUnique.mockResolvedValue({
        id: 'opt-1',
        code: 'OK',
        characteristic: {
          code: 'STATUS',
          classificationModel: { findingTemplates: [] },
        },
      });
      mockPrismaService.classificationOption.delete.mockResolvedValue({});

      const result = await service.deleteOption('opt-1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.classificationOption.delete).toHaveBeenCalledWith({
        where: { id: 'opt-1' },
      });
    });
  });
});
