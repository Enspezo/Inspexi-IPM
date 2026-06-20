import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { DocumentTagsService } from './document-tags.service';
import { PrismaService } from '@/prisma';

describe('DocumentTagsService', () => {
  let service: DocumentTagsService;

  const mockPrisma = {
    documentTag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    documentTagAssignment: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };

  const orgUser = {
    id: 'user-1',
    orgId: 'org-1',
    roles: [Role.ORG_ADMIN],
  } as any;

  const otherOrgTag = {
    id: 'tag-x',
    orgId: 'org-2',
    name: 'Andere org',
    color: '#000000',
    isDeleted: false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentTagsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(DocumentTagsService);
  });

  describe('create', () => {
    it('creates a tag when the name is available', async () => {
      mockPrisma.documentTag.findFirst.mockResolvedValue(null);
      mockPrisma.documentTag.create.mockResolvedValue({ id: 'tag-1' });

      const result = await service.create(
        { name: 'Contract', color: '#3B82F6' },
        orgUser,
      );

      expect(result).toEqual({ id: 'tag-1' });
      expect(mockPrisma.documentTag.create).toHaveBeenCalledWith({
        data: { orgId: 'org-1', name: 'Contract', color: '#3B82F6', sortOrder: 0 },
      });
    });

    it('rejects a duplicate active name within the org', async () => {
      mockPrisma.documentTag.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ name: 'Contract', color: '#3B82F6' }, orgUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.documentTag.create).not.toHaveBeenCalled();
    });

    it('resurrects a soft-deleted tag with the same name instead of inserting', async () => {
      // assertNameAvailable (active check) → none; archived lookup → found
      mockPrisma.documentTag.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'archived-1' });
      mockPrisma.documentTag.update.mockResolvedValue({ id: 'archived-1' });

      const result = await service.create(
        { name: 'Contract', color: '#10B981' },
        orgUser,
      );

      expect(result).toEqual({ id: 'archived-1' });
      expect(mockPrisma.documentTag.update).toHaveBeenCalledWith({
        where: { id: 'archived-1' },
        data: { isDeleted: false, color: '#10B981', sortOrder: 0 },
      });
      expect(mockPrisma.documentTag.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFound for a missing/deleted tag', async () => {
      mockPrisma.documentTag.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope', orgUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Forbidden for a tag from another org', async () => {
      mockPrisma.documentTag.findUnique.mockResolvedValue(otherOrgTag);
      await expect(service.findOne('tag-x', orgUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('softDelete', () => {
    it('drops assignments and marks the tag deleted', async () => {
      mockPrisma.documentTag.findUnique.mockResolvedValue({
        id: 'tag-1',
        orgId: 'org-1',
        isDeleted: false,
      });

      await service.softDelete('tag-1', orgUser);

      expect(mockPrisma.documentTagAssignment.deleteMany).toHaveBeenCalledWith({
        where: { documentTagId: 'tag-1' },
      });
      expect(mockPrisma.documentTag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { isDeleted: true },
      });
    });
  });
});
