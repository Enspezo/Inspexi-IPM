import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AssetTypesService } from './asset-types.service';
import { PrismaService } from '@/prisma';

describe('AssetTypesService', () => {
  let service: AssetTypesService;

  const mockPrismaService = {
    assetTypeDefinition: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    assetTypeField: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    assetTypeConstraint: {
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
        AssetTypesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AssetTypesService>(AssetTypesService);
  });

  describe('findAll', () => {
    it('should return org + system asset-types for an org user', async () => {
      const mockTypes = [
        { id: 'sys-1', code: 'verdeler', orgId: null, isSystem: true, normTypes: [] },
        { id: 'org-at-1', code: 'eigen', orgId: 'org-1', isSystem: false, normTypes: [] },
      ];
      mockPrismaService.assetTypeDefinition.findMany.mockResolvedValue(mockTypes);

      const result = await service.findAll(mockUser);

      expect(result).toHaveLength(2);
      const call = mockPrismaService.assetTypeDefinition.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.OR).toEqual([
        { orgId: 'org-1' },
        { orgId: null, isSystem: true },
      ]);
    });

    it('should not scope by org for SUPERUSER (sees everything)', async () => {
      mockPrismaService.assetTypeDefinition.findMany.mockResolvedValue([]);

      await service.findAll(mockSuperuser);

      const call = mockPrismaService.assetTypeDefinition.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeUndefined();
      expect(call.where.deletedAt).toBeNull();
    });

    it('should filter by normType', async () => {
      mockPrismaService.assetTypeDefinition.findMany.mockResolvedValue([
        { id: 'a', code: 'x', normTypes: ['NEN1010'] },
        { id: 'b', code: 'y', normTypes: ['NEN3140'] },
      ]);

      const result = await service.findAll(mockUser, { normType: 'NEN1010' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });
  });

  describe('findById', () => {
    it('should return the asset-type when found', async () => {
      const mockType = { id: 'at-1', code: 'verdeler', orgId: 'org-1', isSystem: false };
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue(mockType);

      const result = await service.findById('at-1', mockUser);

      expect(result.id).toBe('at-1');
    });

    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue(null);

      await expect(service.findById('nope', mockUser)).rejects.toThrow(
        new NotFoundException('Asset-type niet gevonden'),
      );
    });
  });

  describe('create', () => {
    it('should create an org asset-type', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue(null);
      mockPrismaService.assetTypeDefinition.create.mockResolvedValue({
        id: 'new-1',
        code: 'verdeler',
        orgId: 'org-1',
        isSystem: false,
      });

      const result = await service.create(mockUser, {
        code: 'verdeler',
        name: 'Verdeelinrichting',
      } as any);

      expect(result.id).toBe('new-1');
      const data = mockPrismaService.assetTypeDefinition.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
    });

    it('should create a system asset-type for SUPERUSER', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue(null);
      mockPrismaService.assetTypeDefinition.create.mockResolvedValue({ id: 'sys-new' });

      await service.create(mockSuperuser, { code: 'sys', name: 'Sys' } as any);

      const data = mockPrismaService.assetTypeDefinition.create.mock.calls[0][0].data;
      expect(data.orgId).toBeNull();
      expect(data.isSystem).toBe(true);
    });

    it('should reject a duplicate code', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue({
        id: 'existing',
        code: 'verdeler',
      });

      await expect(
        service.create(mockUser, { code: 'verdeler', name: 'Dup' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.assetTypeDefinition.create).not.toHaveBeenCalled();
    });
  });

  describe('update / assertManageable', () => {
    it('should block an org-admin from editing a system row', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue({
        id: 'sys-1',
        code: 'verdeler',
        orgId: null,
        isSystem: true,
      });

      await expect(
        service.update('sys-1', mockUser, { name: 'Hack' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.assetTypeDefinition.update).not.toHaveBeenCalled();
    });

    it('should allow an org-admin to edit its own org row', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue({
        id: 'org-at-1',
        code: 'eigen',
        orgId: 'org-1',
        isSystem: false,
      });
      mockPrismaService.assetTypeDefinition.update.mockResolvedValue({
        id: 'org-at-1',
        name: 'Nieuwe naam',
      });

      const result = await service.update('org-at-1', mockUser, { name: 'Nieuwe naam' } as any);

      expect(result.name).toBe('Nieuwe naam');
      expect(mockPrismaService.assetTypeDefinition.update).toHaveBeenCalled();
    });
  });

  describe('validateParentConstraint', () => {
    it('should allow a root when a null-parent constraint exists', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue({
        id: 'at-1',
        code: 'verdeler',
        name: 'Verdeelinrichting',
        orgId: 'org-1',
        parentConstraints: [{ allowedParentTypeId: null, allowedParentType: null }],
      });

      const result = await service.validateParentConstraint('verdeler', null, mockUser);

      expect(result.valid).toBe(true);
    });

    it('should reject a root when no null-parent constraint exists', async () => {
      mockPrismaService.assetTypeDefinition.findFirst.mockResolvedValue({
        id: 'at-1',
        code: 'verdeler',
        name: 'Verdeelinrichting',
        orgId: 'org-1',
        parentConstraints: [
          { allowedParentTypeId: 'parent-1', allowedParentType: { id: 'parent-1', code: 'gebouw', name: 'Gebouw' } },
        ],
      });

      const result = await service.validateParentConstraint('verdeler', null, mockUser);

      expect(result.valid).toBe(false);
    });

    it('should reject an unknown parent type', async () => {
      // First findByCode (the asset-type itself) resolves; the parent lookup returns null.
      mockPrismaService.assetTypeDefinition.findFirst
        .mockResolvedValueOnce({
          id: 'at-1',
          code: 'verdeler',
          name: 'Verdeelinrichting',
          orgId: 'org-1',
          parentConstraints: [
            { allowedParentTypeId: 'parent-1', allowedParentType: { id: 'parent-1', code: 'gebouw', name: 'Gebouw' } },
          ],
        })
        .mockResolvedValueOnce(null) // org-specific parent lookup
        .mockResolvedValueOnce(null); // system parent lookup

      const result = await service.validateParentConstraint('verdeler', 'onbekend', mockUser);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Onbekend ouder-type');
    });
  });
});
