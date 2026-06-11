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
      count: jest.fn(),
      update: jest.fn(),
    },
    contact: { findMany: jest.fn(), findUnique: jest.fn() },
    request: { findMany: jest.fn() },
    quote: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    planningItem: { findMany: jest.fn() },
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
    mockPrismaService.request.findMany.mockResolvedValue([]);
    mockPrismaService.quote.findMany.mockResolvedValue([]);
    mockPrismaService.product.findMany.mockResolvedValue([]);
    mockPrismaService.task.findMany.mockResolvedValue([]);
    mockPrismaService.planningItem.findMany.mockResolvedValue([]);
  });

  describe('upload', () => {
    const mockFile = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf-content'),
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
      mockPrismaService.contact.findUnique.mockResolvedValue({ ownerId: 'user-2' });

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
      mockPrismaService.contact.findUnique.mockResolvedValue({ ownerId: 'user-2' });

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
      mockPrismaService.document.findUnique.mockResolvedValue(mockDoc);
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'c-1', companyName: 'ACME Corp' },
      ]);

      const result = await service.findOne('doc-1', mockUser);

      expect(result.entityName).toBe('ACME Corp');
    });

    it('should throw NotFoundException for missing document', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for soft-deleted document', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        isDeleted: true,
      });

      await expect(service.findOne('doc-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org access', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        orgId: 'other-org',
        isDeleted: false,
        entityType: DocumentEntityType.CONTACT,
        entityId: 'c-1',
      });

      await expect(service.findOne('doc-1', mockUser)).rejects.toThrow(
        ForbiddenException,
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
      mockPrismaService.document.findUnique.mockResolvedValue(mockDoc);

      const result = await service.findOne('doc-1', mockSuperuser);

      expect(result.id).toBe('doc-1');
    });
  });

  describe('download', () => {
    it('should return buffer and document metadata', async () => {
      const mockDoc = { id: 'doc-1', orgId: 'org-1', isDeleted: false, storageKey: 'key-1' };
      mockPrismaService.document.findUnique.mockResolvedValue(mockDoc);
      mockStorageProvider.download.mockResolvedValue(Buffer.from('content'));

      const result = await service.download('doc-1', mockUser);

      expect(result.buffer).toBeDefined();
      expect(result.document).toEqual(mockDoc);
      expect(mockStorageProvider.download).toHaveBeenCalledWith('key-1');
    });

    it('should throw NotFoundException for missing document', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(service.download('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org download', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        orgId: 'other-org',
        isDeleted: false,
        storageKey: 'key-1',
      });

      await expect(service.download('doc-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update document description', async () => {
      const existing = { id: 'doc-1', orgId: 'org-1', isDeleted: false, description: 'old' };
      mockPrismaService.document.findUnique.mockResolvedValue(existing);
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

    it('should throw ForbiddenException for cross-org update', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        orgId: 'other-org',
        isDeleted: false,
      });

      await expect(
        service.update('doc-1', { description: 'hack' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a document', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
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
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org delete', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        orgId: 'other-org',
        isDeleted: false,
      });

      await expect(service.remove('doc-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
