import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FavoritesService } from './favorites.service';
import { PrismaService } from '@/prisma';

describe('FavoritesService', () => {
  let service: FavoritesService;

  const mockPrismaService = {
    favorite: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    // Delegates resolved dynamically via delegateFor(model).
    contact: { findUnique: jest.fn(), findMany: jest.fn() },
    request: { findUnique: jest.fn(), findMany: jest.fn() },
    task: { findUnique: jest.fn(), findMany: jest.fn() },
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    roles: [Role.SUPERUSER],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FavoritesService>(FavoritesService);
  });

  describe('add', () => {
    it('checks ownership then upserts idempotently', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.favorite.upsert.mockResolvedValue({ id: 'fav-1' });

      const result = await service.add(
        { entityType: 'Contact', entityId: 'c-1' },
        mockUser,
      );

      expect(mockPrismaService.contact.findUnique).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        select: { orgId: true },
      });
      expect(mockPrismaService.favorite.upsert).toHaveBeenCalledWith({
        where: {
          userId_entityType_entityId: {
            userId: 'user-1',
            entityType: 'Contact',
            entityId: 'c-1',
          },
        },
        create: {
          userId: 'user-1',
          orgId: 'org-1',
          entityType: 'Contact',
          entityId: 'c-1',
        },
        update: {},
      });
      expect(result).toEqual({ id: 'fav-1' });
    });

    it('persists the entity orgId for a SUPERUSER (null orgId)', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-7' });
      mockPrismaService.favorite.upsert.mockResolvedValue({ id: 'fav-2' });

      await service.add({ entityType: 'Contact', entityId: 'c-9' }, mockSuperuser);

      const args = mockPrismaService.favorite.upsert.mock.calls[0][0];
      expect(args.create.orgId).toBe('org-7');
    });

    it('rejects cross-tenant favorites with ForbiddenException', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.add({ entityType: 'Contact', entityId: 'c-1' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.favorite.upsert).not.toHaveBeenCalled();
    });

    it('rejects a missing entity with NotFoundException', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(null);

      await expect(
        service.add({ entityType: 'Contact', entityId: 'missing' }, mockUser),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.favorite.upsert).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deleteMany with the right where; resolves when nothing matched', async () => {
      mockPrismaService.favorite.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove({ entityType: 'Contact', entityId: 'c-1' }, mockUser),
      ).resolves.toBeUndefined();

      expect(mockPrismaService.favorite.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', entityType: 'Contact', entityId: 'c-1' },
      });
    });
  });

  describe('getKeys / getFavoriteRefSet', () => {
    it('getKeys returns the selected pairs', async () => {
      const keys = [
        { entityType: 'Contact', entityId: 'c-1' },
        { entityType: 'Task', entityId: 't-1' },
      ];
      mockPrismaService.favorite.findMany.mockResolvedValue(keys);

      const result = await service.getKeys(mockUser);

      expect(result).toEqual(keys);
      expect(mockPrismaService.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { entityType: true, entityId: true },
      });
    });

    it('getFavoriteRefSet returns a Set of `Type:id`', async () => {
      mockPrismaService.favorite.findMany.mockResolvedValue([
        { entityType: 'Contact', entityId: 'c-1' },
        { entityType: 'Task', entityId: 't-1' },
      ]);

      const set = await service.getFavoriteRefSet(mockUser);

      expect(set.has('Contact:c-1')).toBe(true);
      expect(set.has('Task:t-1')).toBe(true);
      expect(set.has('Contact:other')).toBe(false);
    });
  });

  describe('list', () => {
    it('groups by entityType in FAVORITABLE order and enriches names', async () => {
      // Stored newest-first; Task is favorited after Contact.
      mockPrismaService.favorite.findMany.mockResolvedValue([
        {
          id: 'fav-t',
          entityType: 'Task',
          entityId: 't-1',
          createdAt: new Date('2026-06-02'),
        },
        {
          id: 'fav-c',
          entityType: 'Contact',
          entityId: 'c-1',
          createdAt: new Date('2026-06-01'),
        },
      ]);
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'c-1', companyName: 'ACME B.V.' },
      ]);
      mockPrismaService.task.findMany.mockResolvedValue([
        { id: 't-1', title: 'Inspectie plannen' },
      ]);

      const { groups } = await service.list(mockUser, {});

      // Contact precedes Task because that is its position in FAVORITABLE_ENTITY_TYPES.
      expect(groups.map((g) => g.entityType)).toEqual(['Contact', 'Task']);
      expect(groups[0].items[0].name).toBe('ACME B.V.');
      expect(groups[1].items[0].name).toBe('Inspectie plannen');
    });

    it('falls back to "(verwijderd)" when the referenced record is gone', async () => {
      mockPrismaService.favorite.findMany.mockResolvedValue([
        {
          id: 'fav-c',
          entityType: 'Contact',
          entityId: 'c-missing',
          createdAt: new Date('2026-06-01'),
        },
      ]);
      mockPrismaService.contact.findMany.mockResolvedValue([]);

      const { groups } = await service.list(mockUser, {});

      expect(groups[0].items[0].name).toBe('(verwijderd)');
    });

    it('honors the entityType filter', async () => {
      mockPrismaService.favorite.findMany.mockResolvedValue([
        {
          id: 'fav-c',
          entityType: 'Contact',
          entityId: 'c-1',
          createdAt: new Date('2026-06-01'),
        },
      ]);
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'c-1', companyName: 'ACME B.V.' },
      ]);

      const { groups } = await service.list(mockUser, { entityType: 'Contact' });

      expect(mockPrismaService.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', entityType: 'Contact' },
        orderBy: { createdAt: 'desc' },
      });
      expect(groups).toHaveLength(1);
      expect(groups[0].entityType).toBe('Contact');
    });
  });
});
