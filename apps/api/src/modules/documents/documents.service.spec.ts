import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role, DocumentEntityType, NotificationType } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockPrismaService = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    contact: { findMany: jest.fn(), findUnique: jest.fn() },
    location: { findMany: jest.fn(), findUnique: jest.fn() },
    request: { findMany: jest.fn(), findUnique: jest.fn() },
    quote: { findMany: jest.fn(), findUnique: jest.fn() },
    product: { findMany: jest.fn(), findUnique: jest.fn() },
    task: { findMany: jest.fn(), findUnique: jest.fn() },
    planningItem: { findMany: jest.fn(), findUnique: jest.fn() },
    project: { findMany: jest.fn(), findUnique: jest.fn() },
    workOrder: { findMany: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    documentTag: { findMany: jest.fn() },
    documentTagAssignment: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  const mockStorageProvider = {
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
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
        DocumentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);

    // Default: enrichWithEntityNames returns empty
    mockPrismaService.contact.findMany.mockResolvedValue([]);
    mockPrismaService.location.findMany.mockResolvedValue([]);
    mockPrismaService.request.findMany.mockResolvedValue([]);
    mockPrismaService.quote.findMany.mockResolvedValue([]);
    mockPrismaService.product.findMany.mockResolvedValue([]);
    mockPrismaService.task.findMany.mockResolvedValue([]);
    mockPrismaService.planningItem.findMany.mockResolvedValue([]);
    mockPrismaService.project.findMany.mockResolvedValue([]);
    mockPrismaService.workOrder.findMany.mockResolvedValue([]);
    mockPrismaService.user.findMany.mockResolvedValue([]);

    // Default: org-scope validation (assertSameOrg) finds an in-org entity
    mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.location.findUnique.mockResolvedValue({ orgId: 'org-1' });

    // Default: no tags involved
    mockPrismaService.documentTag.findMany.mockResolvedValue([]);
  });

  describe('upload', () => {
    // Echte %PDF-header — de upload kruist sinds WP-B4 claim ↔ inhoud.
    const mockFile = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\npdf-content'),
      size: 1024,
    } as Express.Multer.File;

    const mockDto = {
      entityType: DocumentEntityType.CONTACT,
      entityId: 'contact-1',
      description: 'Test document',
    };

    it('should upload a document and store in storage', async () => {
      const mockDocument = {
        id: 'doc-1',
        orgId: 'org-1',
        entityType: DocumentEntityType.CONTACT,
        entityId: 'contact-1',
        fileName: 'test.pdf',
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storageKey: expect.any(String),
        description: 'Test document',
        uploadedById: 'user-1',
        uploadedBy: { id: 'user-1', firstName: 'Admin', lastName: 'Test', email: 'admin@test.nl' },
      };

      mockPrismaService.document.create.mockResolvedValue(mockDocument);
      // Notification recipient resolution
      mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1', ownerId: 'user-2' });

      const result = await service.upload(mockFile, mockDto, mockUser);

      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.stringContaining('org-1/'),
        mockFile.buffer,
        'application/pdf',
      );
      expect(mockPrismaService.document.create).toHaveBeenCalled();
      expect(result).toHaveProperty('entityName');
    });

    it('should dispatch notification on upload', async () => {
      const mockDocument = {
        id: 'doc-1',
        orgId: 'org-1',
        entityType: DocumentEntityType.CONTACT,
        entityId: 'contact-1',
        originalName: 'test.pdf',
        uploadedById: 'user-1',
        uploadedBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };

      mockPrismaService.document.create.mockResolvedValue(mockDocument);
      mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1', ownerId: 'user-2' });

      await service.upload(mockFile, mockDto, mockUser);

      // Notification dispatch is fire-and-forget, give it a tick
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.DOCUMENT_GEUPLOAD,
          orgId: 'org-1',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated documents for org user', async () => {
      const mockDocs = [
        { id: 'doc-1', entityType: DocumentEntityType.CONTACT, entityId: 'c-1', isDeleted: false },
      ];
      mockPrismaService.document.findMany.mockResolvedValue(mockDocs);
      mockPrismaService.document.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1', isDeleted: false }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.document.findMany.mockResolvedValue([]);
      mockPrismaService.document.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 } as any);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ orgId: expect.anything() }),
        }),
      );
    });

    it('should filter by onlyMine', async () => {
      mockPrismaService.document.findMany.mockResolvedValue([]);
      mockPrismaService.document.count.mockResolvedValue(0);

      await service.findAll(mockUser, { onlyMine: 'true', page: 1, limit: 20 } as any);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ uploadedById: 'user-1' }),
        }),
      );
    });

    it('should filter by entityType and entityId', async () => {
      mockPrismaService.document.findMany.mockResolvedValue([]);
      mockPrismaService.document.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        entityType: DocumentEntityType.CONTACT,
        entityId: 'c-1',
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: DocumentEntityType.CONTACT,
            entityId: 'c-1',
          }),
        }),
      );
    });

    it('should filter by search term', async () => {
      mockPrismaService.document.findMany.mockResolvedValue([]);
      mockPrismaService.document.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'test', page: 1, limit: 20 } as any);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            originalName: { contains: 'test', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should filter by tagId (only non-deleted tag assignments)', async () => {
      mockPrismaService.document.findMany.mockResolvedValue([]);
      mockPrismaService.document.count.mockResolvedValue(0);

      await service.findAll(mockUser, { tagId: 'tag-1', page: 1, limit: 20 } as any);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: { some: { documentTagId: 'tag-1', documentTag: { isDeleted: false } } },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a document with entity name', async () => {
      const mockDoc = {
        id: 'doc-1',
        orgId: 'org-1',
        isDeleted: false,
        entityType: DocumentEntityType.CONTACT,
        entityId: 'c-1',
        uploadedBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.document.findFirst.mockResolvedValue(mockDoc);
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'c-1', companyName: 'ACME Corp' },
      ]);

      const result = await service.findOne('doc-1', mockUser);

      expect(result.entityName).toBe('ACME Corp');
    });

    it('should throw NotFoundException for missing document', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for soft-deleted document (scoped query)', async () => {
      // De where-clause filtert isDeleted weg — de scoped query levert null.
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(service.findOne('doc-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
        }),
      );
    });

    it('should throw the same NotFoundException for cross-org access (B-105: geen oracle)', async () => {
      // Org-scoped query: een vreemde-org-id levert null, identiek aan een
      // niet-bestaand id — cross-org "bestaat niet".
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(service.findOne('doc-1', mockUser)).rejects.toThrow(
        'Document niet gevonden',
      );
      expect(mockPrismaService.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should allow SUPERUSER to access any org document', async () => {
      const mockDoc = {
        id: 'doc-1',
        orgId: 'other-org',
        isDeleted: false,
        entityType: DocumentEntityType.CONTACT,
        entityId: 'c-1',
        uploadedBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.document.findFirst.mockResolvedValue(mockDoc);

      const result = await service.findOne('doc-1', mockSuperuser);

      expect(result.id).toBe('doc-1');
    });
  });

  describe('download', () => {
    it('should return buffer and document metadata', async () => {
      const mockDoc = { id: 'doc-1', orgId: 'org-1', isDeleted: false, storageKey: 'key-1' };
      mockPrismaService.document.findFirst.mockResolvedValue(mockDoc);
      mockStorageProvider.download.mockResolvedValue(Buffer.from('content'));

      const result = await service.download('doc-1', mockUser);

      expect(result.buffer).toBeDefined();
      expect(result.document).toEqual(mockDoc);
      expect(mockStorageProvider.download).toHaveBeenCalledWith('key-1');
    });

    it('should throw NotFoundException for missing document', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(service.download('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw the same NotFoundException for cross-org download (B-105)', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(service.download('doc-1', mockUser)).rejects.toThrow(
        'Document niet gevonden',
      );
      expect(mockPrismaService.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1', isDeleted: false }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should update document description', async () => {
      const existing = { id: 'doc-1', orgId: 'org-1', isDeleted: false, description: 'old' };
      mockPrismaService.document.findFirst.mockResolvedValue(existing);
      const updated = {
        ...existing,
        description: 'new desc',
        entityType: DocumentEntityType.CONTACT,
        entityId: 'c-1',
        uploadedBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.document.update.mockResolvedValue(updated);

      const result = await service.update('doc-1', { description: 'new desc' }, mockUser);

      expect(mockPrismaService.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: expect.objectContaining({ description: 'new desc' }),
        }),
      );
    });

    it('should throw the same NotFoundException for cross-org update (B-105)', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(
        service.update('doc-1', { description: 'hack' }, mockUser),
      ).rejects.toThrow('Document niet gevonden');
      expect(mockPrismaService.document.update).not.toHaveBeenCalled();
    });

    it('should replace the tag-set when tagIds is provided', async () => {
      const existing = { id: 'doc-1', orgId: 'org-1', isDeleted: false, description: 'd' };
      mockPrismaService.document.findFirst.mockResolvedValue(existing);
      // assertAllSameOrg + active-tag check both query documentTag.findMany
      mockPrismaService.documentTag.findMany.mockResolvedValue([{ id: 'tag-1' }]);
      mockPrismaService.document.update.mockResolvedValue({
        ...existing,
        entityType: DocumentEntityType.CONTACT,
        entityId: 'c-1',
        tags: [{ documentTag: { id: 'tag-1', name: 'Contract', color: '#3B82F6' } }],
        uploadedBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      });

      const result = await service.update('doc-1', { tagIds: ['tag-1'] }, mockUser);

      expect(mockPrismaService.documentTagAssignment.deleteMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1' },
      });
      expect(mockPrismaService.documentTagAssignment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ documentId: 'doc-1', documentTagId: 'tag-1', orgId: 'org-1' }],
        }),
      );
      expect(result.tags).toEqual([{ id: 'tag-1', name: 'Contract', color: '#3B82F6' }]);
    });

    it('should reject tagIds from another org (cross-tenant)', async () => {
      const existing = { id: 'doc-1', orgId: 'org-1', isDeleted: false, description: 'd' };
      mockPrismaService.document.findFirst.mockResolvedValue(existing);
      // assertAllSameOrg: the foreign tag is not found within org-1
      mockPrismaService.documentTag.findMany.mockResolvedValue([]);

      await expect(
        service.update('doc-1', { tagIds: ['foreign-tag'] }, mockUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.document.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft-delete a document', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        orgId: 'org-1',
        isDeleted: false,
      });
      mockPrismaService.document.update.mockResolvedValue({});

      await service.remove('doc-1', mockUser);

      expect(mockPrismaService.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { isDeleted: true },
      });
    });

    it('should throw NotFoundException for missing document', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw the same NotFoundException for cross-org delete (B-105)', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue(null);

      await expect(service.remove('doc-1', mockUser)).rejects.toThrow(
        'Document niet gevonden',
      );
      expect(mockPrismaService.document.update).not.toHaveBeenCalled();
    });
  });

  describe('LOCATION entity linking', () => {
    const locationFile = {
      originalname: 'plattegrond.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\npdf'),
      size: 512,
    } as Express.Multer.File;

    const locationDto = {
      entityType: DocumentEntityType.LOCATION,
      entityId: 'loc-1',
      description: 'Plattegrond',
    };

    it('should resolve a location name in enrichWithEntityNames', async () => {
      mockPrismaService.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        orgId: 'org-1',
        isDeleted: false,
        entityType: DocumentEntityType.LOCATION,
        entityId: 'loc-1',
        uploadedBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      });
      mockPrismaService.location.findMany.mockResolvedValue([
        { id: 'loc-1', name: 'Magazijn Noord' },
      ]);

      const result = await service.findOne('doc-1', mockUser);

      expect(result.entityName).toBe('Magazijn Noord');
    });

    it('should upload a document linked to an in-org location', async () => {
      mockPrismaService.location.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.document.create.mockResolvedValue({
        id: 'doc-1',
        orgId: 'org-1',
        entityType: DocumentEntityType.LOCATION,
        entityId: 'loc-1',
        originalName: 'plattegrond.pdf',
        uploadedById: 'user-1',
        uploadedBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      });
      mockPrismaService.location.findMany.mockResolvedValue([
        { id: 'loc-1', name: 'Magazijn Noord' },
      ]);

      const result = await service.upload(locationFile, locationDto, mockUser);

      expect(mockPrismaService.location.findUnique).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        select: { orgId: true },
      });
      expect(mockPrismaService.document.create).toHaveBeenCalled();
      expect(result.entityName).toBe('Magazijn Noord');
    });

    it('should reject upload when the location belongs to another org', async () => {
      mockPrismaService.location.findUnique.mockResolvedValue({ orgId: 'other-org' });

      await expect(
        service.upload(locationFile, locationDto, mockUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });

    it('should reject upload when the location does not exist', async () => {
      mockPrismaService.location.findUnique.mockResolvedValue(null);

      await expect(
        service.upload(locationFile, locationDto, mockUser),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });
  });
});
