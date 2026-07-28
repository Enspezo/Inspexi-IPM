import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CustomFieldEntityType, CustomFieldType } from '@prisma/client';
import { CustomFieldsService } from './custom-fields.service';
import { PrismaService } from '@/prisma';

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;

  const mockPrismaService = {
    customFieldDefinition: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const orgId = 'org-1';

  const mockField = {
    id: 'field-1',
    orgId,
    entityType: CustomFieldEntityType.CONTACT,
    fieldName: 'certificaatnummer',
    label: 'Certificaatnummer',
    fieldType: CustomFieldType.TEXT,
    options: null,
    isRequired: false,
    sortOrder: 0,
    isDeleted: false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CustomFieldsService>(CustomFieldsService);
  });

  // ─── findAll ───────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all non-deleted fields for an org', async () => {
      mockPrismaService.customFieldDefinition.findMany.mockResolvedValue([mockField]);

      const result = await service.findAll(orgId);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Certificaatnummer');
      expect(mockPrismaService.customFieldDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId, isDeleted: false },
          orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }],
        }),
      );
    });

    it('should return empty array when no fields exist', async () => {
      mockPrismaService.customFieldDefinition.findMany.mockResolvedValue([]);

      const result = await service.findAll(orgId);

      expect(result).toHaveLength(0);
    });
  });

  // ─── findByEntityType ─────────────────────────────────────

  describe('findByEntityType', () => {
    it('should return fields filtered by entity type', async () => {
      mockPrismaService.customFieldDefinition.findMany.mockResolvedValue([mockField]);

      const result = await service.findByEntityType(orgId, CustomFieldEntityType.CONTACT);

      expect(result).toHaveLength(1);
      expect(mockPrismaService.customFieldDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId,
            entityType: CustomFieldEntityType.CONTACT,
            isDeleted: false,
          },
          orderBy: { sortOrder: 'asc' },
        }),
      );
    });
  });

  // ─── create ────────────────────────────────────────────────

  describe('create', () => {
    const validTextDto = {
      entityType: CustomFieldEntityType.CONTACT,
      label: 'Certificaatnummer',
      fieldType: CustomFieldType.TEXT,
    } as any;

    beforeEach(() => {
      // By default, no existing field and limits not exceeded
      mockPrismaService.customFieldDefinition.count.mockResolvedValue(0);
      mockPrismaService.customFieldDefinition.findUnique.mockResolvedValue(null);
      mockPrismaService.customFieldDefinition.aggregate.mockResolvedValue({
        _max: { sortOrder: null },
      });
    });

    it('should create a TEXT field successfully', async () => {
      mockPrismaService.customFieldDefinition.create.mockResolvedValue(mockField);

      const result = await service.create(orgId, validTextDto);

      expect(result.id).toBe('field-1');
      expect(mockPrismaService.customFieldDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId,
            entityType: CustomFieldEntityType.CONTACT,
            fieldName: 'certificaatnummer',
            label: 'Certificaatnummer',
            fieldType: CustomFieldType.TEXT,
          }),
        }),
      );
    });

    it('should assign sortOrder as maxSortOrder + 1', async () => {
      mockPrismaService.customFieldDefinition.aggregate.mockResolvedValue({
        _max: { sortOrder: 3 },
      });
      mockPrismaService.customFieldDefinition.create.mockResolvedValue({
        ...mockField,
        sortOrder: 4,
      });

      await service.create(orgId, validTextDto);

      expect(mockPrismaService.customFieldDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 4 }),
        }),
      );
    });

    it('should create a SELECT field with options', async () => {
      const selectDto = {
        entityType: CustomFieldEntityType.CONTACT,
        label: 'Status type',
        fieldType: CustomFieldType.SELECT,
        options: ['Optie A', 'Optie B'],
      } as any;

      mockPrismaService.customFieldDefinition.create.mockResolvedValue({
        ...mockField,
        fieldType: CustomFieldType.SELECT,
        fieldName: 'status_type',
        options: ['Optie A', 'Optie B'],
      });

      await service.create(orgId, selectDto);

      expect(mockPrismaService.customFieldDefinition.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException for SELECT field without options', async () => {
      const badDto = {
        entityType: CustomFieldEntityType.CONTACT,
        label: 'Keuze veld',
        fieldType: CustomFieldType.SELECT,
        options: [],
      } as any;

      await expect(service.create(orgId, badDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when SELECT options is undefined', async () => {
      const badDto = {
        entityType: CustomFieldEntityType.CONTACT,
        label: 'Keuze veld',
        fieldType: CustomFieldType.SELECT,
      } as any;

      await expect(service.create(orgId, badDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when field name already exists', async () => {
      mockPrismaService.customFieldDefinition.findUnique.mockResolvedValue({
        ...mockField,
        isDeleted: false,
      });

      await expect(service.create(orgId, validTextDto)).rejects.toThrow(ConflictException);
    });

    it('should reuse soft-deleted field with same name', async () => {
      const deletedField = { ...mockField, isDeleted: true };
      mockPrismaService.customFieldDefinition.findUnique.mockResolvedValue(deletedField);
      mockPrismaService.customFieldDefinition.update.mockResolvedValue({
        ...mockField,
        isDeleted: false,
        sortOrder: 0,
      });

      const result = await service.create(orgId, validTextDto);

      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'field-1' },
          data: expect.objectContaining({ isDeleted: false }),
        }),
      );
    });

    it('should throw BadRequestException when entity limit (5) is exceeded', async () => {
      mockPrismaService.customFieldDefinition.count
        .mockResolvedValueOnce(5) // entity count at limit
        .mockResolvedValueOnce(5); // total count

      await expect(service.create(orgId, validTextDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when total org limit (10) is exceeded', async () => {
      mockPrismaService.customFieldDefinition.count
        .mockResolvedValueOnce(2) // entity count ok
        .mockResolvedValueOnce(10); // total count at limit

      await expect(service.create(orgId, validTextDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── update ────────────────────────────────────────────────

  describe('update', () => {
    beforeEach(() => {
      mockPrismaService.customFieldDefinition.findFirst.mockResolvedValue(mockField);
    });

    it('should update label and isRequired', async () => {
      const updated = { ...mockField, label: 'Nieuw label', isRequired: true };
      mockPrismaService.customFieldDefinition.update.mockResolvedValue(updated);

      const result = await service.update('field-1', orgId, {
        label: 'Nieuw label',
        isRequired: true,
      });

      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'field-1' },
          data: expect.objectContaining({ label: 'Nieuw label', isRequired: true }),
        }),
      );
    });

    it('should update options for SELECT field', async () => {
      mockPrismaService.customFieldDefinition.findFirst.mockResolvedValue({
        ...mockField,
        fieldType: CustomFieldType.SELECT,
        options: ['Old'],
      });
      const updated = { ...mockField, options: ['New A', 'New B'] };
      mockPrismaService.customFieldDefinition.update.mockResolvedValue(updated);

      await service.update('field-1', orgId, { options: ['New A', 'New B'] });

      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ options: ['New A', 'New B'] }),
        }),
      );
    });

    it('should throw BadRequestException when clearing options on SELECT field', async () => {
      mockPrismaService.customFieldDefinition.findFirst.mockResolvedValue({
        ...mockField,
        fieldType: CustomFieldType.SELECT,
        options: ['Optie A'],
      });

      await expect(
        service.update('field-1', orgId, { options: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when field does not exist', async () => {
      mockPrismaService.customFieldDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', orgId, { label: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for cross-org field', async () => {
      mockPrismaService.customFieldDefinition.findFirst.mockResolvedValue(null); // findFirst returns null for wrong org

      await expect(
        service.update('field-1', 'other-org', { label: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete a field', async () => {
      mockPrismaService.customFieldDefinition.findFirst.mockResolvedValue(mockField);
      mockPrismaService.customFieldDefinition.update.mockResolvedValue({
        ...mockField,
        isDeleted: true,
      });

      await service.remove('field-1', orgId);

      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledWith({
        where: { id: 'field-1' },
        data: { isDeleted: true },
      });
    });

    it('should throw NotFoundException when field does not exist', async () => {
      mockPrismaService.customFieldDefinition.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── reorder ───────────────────────────────────────────────

  describe('reorder', () => {
    it('should update sortOrder for each field in order', async () => {
      const orderedIds = ['field-3', 'field-1', 'field-2'];

      // Mock $transaction to execute all update calls
      mockPrismaService.$transaction.mockImplementation(
        async (calls: Promise<any>[]) => Promise.all(calls),
      );
      mockPrismaService.customFieldDefinition.count.mockResolvedValue(3);
      mockPrismaService.customFieldDefinition.update.mockResolvedValue({});

      await service.reorder(orgId, orderedIds);

      expect(mockPrismaService.customFieldDefinition.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: orderedIds }, orgId, isDeleted: false }),
        }),
      );

      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'field-3' }, data: { sortOrder: 0 } }),
      );
      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'field-1' }, data: { sortOrder: 1 } }),
      );
      expect(mockPrismaService.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'field-2' }, data: { sortOrder: 2 } }),
      );
    });

    it('should handle empty orderedIds without error', async () => {
      mockPrismaService.$transaction.mockImplementation(
        async (calls: Promise<any>[]) => Promise.all(calls),
      );
      mockPrismaService.customFieldDefinition.count.mockResolvedValue(0);

      await service.reorder(orgId, []);

      expect(mockPrismaService.customFieldDefinition.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when an id belongs to another org', async () => {
      const orderedIds = ['field-1', 'foreign-field'];
      // Only one of the two ids is found within the caller's org.
      mockPrismaService.customFieldDefinition.count.mockResolvedValue(1);

      await expect(service.reorder(orgId, orderedIds)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.customFieldDefinition.update).not.toHaveBeenCalled();
    });
  });
});
