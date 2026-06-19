import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { PrismaService } from '@/prisma';

describe('CategoriesService', () => {
  let service: CategoriesService;

  const mockPrismaService = {
    category: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
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
        CategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('findAll', () => {
    it('should scope to org + system for an org user', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([]);

      await service.findAll(mockUser);

      const call = mockPrismaService.category.findMany.mock.calls[0][0];
      expect(call.where.AND).toEqual([
        { OR: [{ orgId: 'org-1' }, { orgId: null, isSystem: true }] },
        { isActive: true },
      ]);
    });

    it('should not scope by org for SUPERUSER (sees everything)', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([]);

      await service.findAll(mockSuperuser);

      const call = mockPrismaService.category.findMany.mock.calls[0][0];
      // Only the active filter remains; no org OR clause
      expect(call.where.AND).toEqual([{ isActive: true }]);
    });

    it('should add a parentId filter when provided', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([]);

      await service.findAll(mockUser, { parentId: 'parent-1' });

      const call = mockPrismaService.category.findMany.mock.calls[0][0];
      expect(call.where.AND).toContainEqual({ parentId: 'parent-1' });
    });
  });

  describe('getTree', () => {
    it('should build a nested hierarchy from a flat list', async () => {
      mockPrismaService.category.findMany.mockResolvedValue([
        { id: 'root', parentId: null, name: 'Root', orgId: 'org-1', isSystem: false },
        { id: 'child', parentId: 'root', name: 'Child', orgId: 'org-1', isSystem: false },
        { id: 'grandchild', parentId: 'child', name: 'GC', orgId: 'org-1', isSystem: false },
      ]);

      const tree = await service.getTree(mockUser);

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('root');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe('child');
      expect(tree[0].children[0].children[0].id).toBe('grandchild');
    });
  });

  describe('findById', () => {
    it('should return the category when found', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Test',
        orgId: 'org-1',
        isSystem: false,
      });

      const result = await service.findById('cat-1', mockUser);

      expect(result.id).toBe('cat-1');
    });

    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null);

      await expect(service.findById('nope', mockUser)).rejects.toThrow(
        new NotFoundException('Categorie niet gevonden'),
      );
    });
  });

  describe('create', () => {
    it('should create an org category', async () => {
      mockPrismaService.category.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrismaService.category.create.mockResolvedValue({
        id: 'new-1',
        name: 'Verdelers',
        orgId: 'org-1',
        isSystem: false,
      });

      const result = await service.create(mockUser, { name: 'Verdelers' } as any);

      expect(result.id).toBe('new-1');
      const data = mockPrismaService.category.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
      expect(data.createdBy).toBe('user-1');
      expect(data.sortOrder).toBe(3);
    });

    it('should create a system category for SUPERUSER', async () => {
      mockPrismaService.category.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrismaService.category.create.mockResolvedValue({ id: 'sys-new' });

      await service.create(mockSuperuser, { name: 'Systeem' } as any);

      const data = mockPrismaService.category.create.mock.calls[0][0].data;
      expect(data.orgId).toBeNull();
      expect(data.isSystem).toBe(true);
      expect(data.sortOrder).toBe(0);
    });

    it('should forbid an org user from creating a system category', async () => {
      await expect(
        service.create(mockUser, { name: 'Hack', isSystem: true } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.category.create).not.toHaveBeenCalled();
    });

    it('should reject a parent that is not visible', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create(mockUser, { name: 'Kind', parentId: 'foreign-parent' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.category.create).not.toHaveBeenCalled();
    });
  });

  describe('update / assertManageable', () => {
    it('should block an org-admin from editing a system row', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        id: 'sys-1',
        name: 'Systeem',
        orgId: null,
        isSystem: true,
        parentId: null,
      });

      await expect(
        service.update('sys-1', mockUser, { name: 'Hack' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.category.update).not.toHaveBeenCalled();
    });

    it('should allow an org-admin to edit its own org row', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        id: 'org-cat-1',
        name: 'Eigen',
        orgId: 'org-1',
        isSystem: false,
        parentId: null,
      });
      mockPrismaService.category.update.mockResolvedValue({
        id: 'org-cat-1',
        name: 'Nieuwe naam',
      });

      const result = await service.update('org-cat-1', mockUser, {
        name: 'Nieuwe naam',
      } as any);

      expect(result.name).toBe('Nieuwe naam');
      expect(mockPrismaService.category.update).toHaveBeenCalled();
    });

    it('should reject making a category its own parent', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Eigen',
        orgId: 'org-1',
        isSystem: false,
        parentId: null,
      });

      await expect(
        service.update('cat-1', mockUser, { parentId: 'cat-1' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.category.update).not.toHaveBeenCalled();
    });

    it('should reject a circular move (parent is a descendant)', async () => {
      // The category being updated (findById → findFirst)
      mockPrismaService.category.findFirst
        .mockResolvedValueOnce({
          id: 'cat-1',
          name: 'Ouder',
          orgId: 'org-1',
          isSystem: false,
          parentId: null,
        })
        // findVisibleOrThrow(newParent)
        .mockResolvedValueOnce({
          id: 'cat-2',
          name: 'Kind',
          orgId: 'org-1',
          isSystem: false,
          parentId: 'cat-1',
        });
      // isDescendantOf walks: cat-2 → parent cat-1 === ancestor cat-1 → true
      mockPrismaService.category.findUnique.mockResolvedValueOnce({ parentId: 'cat-1' });

      await expect(
        service.update('cat-1', mockUser, { parentId: 'cat-2' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.category.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should reject deleting a category with children', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Ouder',
        orgId: 'org-1',
        isSystem: false,
        parentId: null,
      });
      mockPrismaService.category.count.mockResolvedValue(2);

      await expect(service.delete('cat-1', mockUser)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.category.delete).not.toHaveBeenCalled();
    });

    it('should delete a leaf category', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Blad',
        orgId: 'org-1',
        isSystem: false,
        parentId: null,
      });
      mockPrismaService.category.count.mockResolvedValue(0);
      mockPrismaService.category.delete.mockResolvedValue({ id: 'cat-1' });

      const result = await service.delete('cat-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
    });
  });

  describe('reorder', () => {
    it('should update sort orders in a transaction for visible org rows', async () => {
      mockPrismaService.category.findFirst
        .mockResolvedValueOnce({ id: 'a', orgId: 'org-1', isSystem: false })
        .mockResolvedValueOnce({ id: 'b', orgId: 'org-1', isSystem: false });
      mockPrismaService.$transaction.mockResolvedValue([]);

      const result = await service.reorder(mockUser, {
        items: [
          { id: 'a', sortOrder: 0 },
          { id: 'b', sortOrder: 1 },
        ],
      } as any);

      expect(result).toEqual({ reordered: true });
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.category.update).toHaveBeenCalledTimes(2);
    });

    it('should forbid an org-admin from reordering system rows', async () => {
      mockPrismaService.category.findFirst.mockResolvedValueOnce({
        id: 'sys-1',
        orgId: null,
        isSystem: true,
      });

      await expect(
        service.reorder(mockUser, { items: [{ id: 'sys-1', sortOrder: 0 }] } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
