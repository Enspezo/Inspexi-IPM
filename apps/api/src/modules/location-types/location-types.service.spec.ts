import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { LocationTypesService } from './location-types.service';
import { PrismaService } from '@/prisma';

describe('LocationTypesService', () => {
  let service: LocationTypesService;

  const mockPrismaService = {
    locationTypeDefinition: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    locationTypeField: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    locationTypeConstraint: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    roles: [Role.SUPERUSER],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationTypesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<LocationTypesService>(LocationTypesService);
  });

  describe('findAll', () => {
    it('should return org + system location-types for an org user', async () => {
      const mockTypes = [
        { id: 'sys-1', code: 'gebouw', orgId: null, isSystem: true, normTypes: [] },
        { id: 'org-lt-1', code: 'eigen', orgId: 'org-1', isSystem: false, normTypes: [] },
      ];
      mockPrismaService.locationTypeDefinition.findMany.mockResolvedValue(mockTypes);

      const result = await service.findAll(mockUser);

      expect(result).toHaveLength(2);
      const call = mockPrismaService.locationTypeDefinition.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.OR).toEqual([
        { orgId: 'org-1' },
        { orgId: null, isSystem: true },
      ]);
    });

    it('should not scope by org for SUPERUSER (sees everything)', async () => {
      mockPrismaService.locationTypeDefinition.findMany.mockResolvedValue([]);

      await service.findAll(mockSuperuser);

      const call = mockPrismaService.locationTypeDefinition.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeUndefined();
      expect(call.where.deletedAt).toBeNull();
    });

    it('should filter by normType', async () => {
      mockPrismaService.locationTypeDefinition.findMany.mockResolvedValue([
        { id: 'a', code: 'x', normTypes: ['NEN1010'] },
        { id: 'b', code: 'y', normTypes: ['NEN3140'] },
      ]);

      const result = await service.findAll(mockUser, { normType: 'NEN1010' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });
  });

  describe('findById', () => {
    it('should return the location-type when found', async () => {
      const mockType = { id: 'lt-1', code: 'gebouw', orgId: 'org-1', isSystem: false };
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue(mockType);

      const result = await service.findById('lt-1', mockUser);

      expect(result.id).toBe('lt-1');
    });

    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue(null);

      await expect(service.findById('nope', mockUser)).rejects.toThrow(
        new NotFoundException('Locatie-type niet gevonden'),
      );
    });
  });

  describe('create', () => {
    it('should create an org location-type', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue(null);
      mockPrismaService.locationTypeDefinition.create.mockResolvedValue({
        id: 'new-1',
        code: 'gebouw',
        orgId: 'org-1',
        isSystem: false,
      });

      const result = await service.create(mockUser, {
        code: 'gebouw',
        name: 'Gebouw',
      } as any);

      expect(result.id).toBe('new-1');
      const data = mockPrismaService.locationTypeDefinition.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
    });

    it('should create a system location-type for SUPERUSER', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue(null);
      mockPrismaService.locationTypeDefinition.create.mockResolvedValue({ id: 'sys-new' });

      await service.create(mockSuperuser, { code: 'sys', name: 'Sys' } as any);

      const data = mockPrismaService.locationTypeDefinition.create.mock.calls[0][0].data;
      expect(data.orgId).toBeNull();
      expect(data.isSystem).toBe(true);
    });

    it('should reject a duplicate code', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue({
        id: 'existing',
        code: 'gebouw',
      });

      await expect(
        service.create(mockUser, { code: 'gebouw', name: 'Dup' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.locationTypeDefinition.create).not.toHaveBeenCalled();
    });
  });

  describe('update / assertManageable', () => {
    it('should block an org-admin from editing a system row', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue({
        id: 'sys-1',
        code: 'gebouw',
        orgId: null,
        isSystem: true,
      });

      await expect(
        service.update('sys-1', mockUser, { name: 'Hack' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.locationTypeDefinition.update).not.toHaveBeenCalled();
    });

    it('should allow an org-admin to edit its own org row', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue({
        id: 'org-lt-1',
        code: 'eigen',
        orgId: 'org-1',
        isSystem: false,
      });
      mockPrismaService.locationTypeDefinition.update.mockResolvedValue({
        id: 'org-lt-1',
        name: 'Nieuwe naam',
      });

      const result = await service.update('org-lt-1', mockUser, { name: 'Nieuwe naam' } as any);

      expect(result.name).toBe('Nieuwe naam');
      expect(mockPrismaService.locationTypeDefinition.update).toHaveBeenCalled();
    });
  });

  describe('validateParentConstraint', () => {
    it('should allow a root when a null-parent constraint exists', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue({
        id: 'lt-1',
        code: 'gebouw',
        name: 'Gebouw',
        orgId: 'org-1',
        parentConstraints: [{ allowedParentTypeId: null, allowedParentType: null }],
      });

      const result = await service.validateParentConstraint('gebouw', null, mockUser);

      expect(result.valid).toBe(true);
    });

    it('should reject a root when no null-parent constraint exists', async () => {
      mockPrismaService.locationTypeDefinition.findFirst.mockResolvedValue({
        id: 'lt-1',
        code: 'verdieping',
        name: 'Verdieping',
        orgId: 'org-1',
        parentConstraints: [
          { allowedParentTypeId: 'parent-1', allowedParentType: { id: 'parent-1', code: 'gebouw', name: 'Gebouw' } },
        ],
      });

      const result = await service.validateParentConstraint('verdieping', null, mockUser);

      expect(result.valid).toBe(false);
    });

    it('should reject an unknown parent type', async () => {
      // First findByCode (the location-type itself) resolves; the parent lookup returns null.
      mockPrismaService.locationTypeDefinition.findFirst
        .mockResolvedValueOnce({
          id: 'lt-1',
          code: 'verdieping',
          name: 'Verdieping',
          orgId: 'org-1',
          parentConstraints: [
            { allowedParentTypeId: 'parent-1', allowedParentType: { id: 'parent-1', code: 'gebouw', name: 'Gebouw' } },
          ],
        })
        .mockResolvedValueOnce(null) // org-specific parent lookup
        .mockResolvedValueOnce(null); // system parent lookup

      const result = await service.validateParentConstraint('verdieping', 'onbekend', mockUser);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Onbekend ouder-type');
    });
  });
});
