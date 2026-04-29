import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role, EmailTemplateType } from '@prisma/client';
import { EmailTemplatesService } from './email-templates.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;

  const mockPrismaService = {
    emailTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    emailTemplateAttachment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
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

  const mockTemplate = {
    id: 'tmpl-1',
    orgId: 'org-1',
    type: EmailTemplateType.OFFERTE_VERSTUURD,
    name: 'Offerte template',
    subject: 'Uw offerte',
    bodyHtml: '<p>Geachte {{contact.voornaam}}</p>',
    bodyJson: {},
    isActive: true,
    createdBy: 'user-1',
    creator: { id: 'user-1', firstName: 'Jan', lastName: 'de Vries' },
    attachments: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
      ],
    }).compile();

    service = module.get<EmailTemplatesService>(EmailTemplatesService);
  });

  describe('findAll', () => {
    it('should return paginated templates for org user', async () => {
      mockPrismaService.emailTemplate.findMany.mockResolvedValue([mockTemplate]);
      mockPrismaService.emailTemplate.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(mockPrismaService.emailTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.emailTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.emailTemplate.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 50 });

      const call = mockPrismaService.emailTemplate.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by type', async () => {
      mockPrismaService.emailTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.emailTemplate.count.mockResolvedValue(0);

      await service.findAll(mockUser, { type: EmailTemplateType.OFFERTE_VERSTUURD, page: 1, limit: 50 });

      expect(mockPrismaService.emailTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: EmailTemplateType.OFFERTE_VERSTUURD }),
        }),
      );
    });

    it('should filter by isActive', async () => {
      mockPrismaService.emailTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.emailTemplate.count.mockResolvedValue(0);

      await service.findAll(mockUser, { isActive: true, page: 1, limit: 50 });

      expect(mockPrismaService.emailTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should filter by search term', async () => {
      mockPrismaService.emailTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.emailTemplate.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'offerte', page: 1, limit: 50 });

      expect(mockPrismaService.emailTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'offerte', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should use default pagination values', async () => {
      mockPrismaService.emailTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.emailTemplate.count.mockResolvedValue(0);

      const result = await service.findAll(mockUser, {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });
  });

  describe('findOne', () => {
    it('should return a template for the owning org user', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);

      const result = await service.findOne('tmpl-1', mockUser);

      expect(result.id).toBe('tmpl-1');
      expect(mockPrismaService.emailTemplate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tmpl-1' } }),
      );
    });

    it('should throw NotFoundException when template does not exist', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org access', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        orgId: 'other-org',
      });

      await expect(service.findOne('tmpl-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow SUPERUSER to access any org template', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        orgId: 'other-org',
      });

      const result = await service.findOne('tmpl-1', mockSuperuser);

      expect(result.id).toBe('tmpl-1');
    });
  });

  describe('create', () => {
    it('should create a template and deactivate existing active ones of same type', async () => {
      const created = { ...mockTemplate, id: 'tmpl-new' };
      const txMock = {
        emailTemplate: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      mockPrismaService.$transaction.mockImplementation((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

      const dto = {
        type: EmailTemplateType.OFFERTE_VERSTUURD,
        name: 'Nieuw template',
        subject: 'Uw offerte',
        bodyHtml: '<p>Inhoud</p>',
      };

      const result = await service.create(dto as any, mockUser);

      expect(result.id).toBe('tmpl-new');
      expect(txMock.emailTemplate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
            type: EmailTemplateType.OFFERTE_VERSTUURD,
            isActive: true,
          }),
          data: { isActive: false },
        }),
      );
      expect(txMock.emailTemplate.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user has no orgId', async () => {
      const dto = {
        type: EmailTemplateType.OFFERTE_VERSTUURD,
        name: 'Template',
        subject: 'Onderwerp',
        bodyHtml: '<p>Inhoud</p>',
      };

      await expect(service.create(dto as any, mockSuperuser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should pass bodyJson from dto or default to empty object', async () => {
      const txMock = {
        emailTemplate: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ ...mockTemplate }),
        },
      };
      mockPrismaService.$transaction.mockImplementation((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

      await service.create(
        { type: EmailTemplateType.CONTACT_EMAIL, name: 'T', subject: 'S', bodyHtml: '<p/>' } as any,
        mockUser,
      );

      expect(txMock.emailTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bodyJson: {} }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should update a template', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      const updated = { ...mockTemplate, name: 'Bijgewerkt' };
      mockPrismaService.emailTemplate.update.mockResolvedValue(updated);

      const result = await service.update('tmpl-1', { name: 'Bijgewerkt' }, mockUser);

      expect(result.name).toBe('Bijgewerkt');
      expect(mockPrismaService.emailTemplate.update).toHaveBeenCalled();
    });

    it('should deactivate other active templates when activating', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplate.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.emailTemplate.update.mockResolvedValue({ ...mockTemplate, isActive: true });

      await service.update('tmpl-1', { isActive: true }, mockUser);

      expect(mockPrismaService.emailTemplate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
            type: EmailTemplateType.OFFERTE_VERSTUURD,
            isActive: true,
            id: { not: 'tmpl-1' },
          }),
          data: { isActive: false },
        }),
      );
    });

    it('should NOT call updateMany when not activating', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplate.update.mockResolvedValue({ ...mockTemplate, name: 'Ander' });

      await service.update('tmpl-1', { name: 'Ander' }, mockUser);

      expect(mockPrismaService.emailTemplate.updateMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing template', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' }, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org update', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        orgId: 'other-org',
      });

      await expect(service.update('tmpl-1', { name: 'X' }, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplate.update.mockResolvedValue({ ...mockTemplate, isActive: false });

      await service.deactivate('tmpl-1', mockUser);

      expect(mockPrismaService.emailTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tmpl-1' },
          data: { isActive: false },
        }),
      );
    });

    it('should throw NotFoundException when template does not exist', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('duplicate', () => {
    const mockAttachment = {
      id: 'att-1',
      emailTemplateId: 'tmpl-1',
      orgId: 'org-1',
      storageKey: 'org-1/et/tmpl-1/file.pdf',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
      fileSize: 1000,
      sortOrder: 0,
    };

    it('should create a copy of the template with "(kopie)" suffix', async () => {
      mockPrismaService.emailTemplate.findUnique
        .mockResolvedValueOnce(mockTemplate) // findOne call inside duplicate
        .mockResolvedValueOnce({ ...mockTemplate, id: 'tmpl-copy', name: 'Offerte template (kopie)', attachments: [] }); // findOne call at end

      mockPrismaService.emailTemplate.create.mockResolvedValue({
        ...mockTemplate,
        id: 'tmpl-copy',
        name: 'Offerte template (kopie)',
        isActive: false,
        attachments: [],
      });

      await service.duplicate('tmpl-1', mockUser);

      expect(mockPrismaService.emailTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Offerte template (kopie)',
            isActive: false,
          }),
        }),
      );
    });

    it('should copy attachments when present', async () => {
      const templateWithAttachments = { ...mockTemplate, attachments: [mockAttachment] };

      mockPrismaService.emailTemplate.findUnique
        .mockResolvedValueOnce(templateWithAttachments) // findOne inside duplicate
        .mockResolvedValueOnce({ ...mockTemplate, id: 'tmpl-copy', attachments: [] }); // findOne at end

      mockPrismaService.emailTemplate.create.mockResolvedValue({
        ...mockTemplate,
        id: 'tmpl-copy',
        attachments: [],
      });

      mockStorageProvider.download.mockResolvedValue(Buffer.from('pdf content'));
      mockStorageProvider.upload.mockResolvedValue(undefined);
      mockPrismaService.emailTemplateAttachment.create.mockResolvedValue({});

      await service.duplicate('tmpl-1', mockUser);

      expect(mockStorageProvider.download).toHaveBeenCalledWith('org-1/et/tmpl-1/file.pdf');
      expect(mockStorageProvider.upload).toHaveBeenCalled();
      expect(mockPrismaService.emailTemplateAttachment.create).toHaveBeenCalled();
    });

    it('should continue even if attachment copy fails', async () => {
      const templateWithAttachments = { ...mockTemplate, attachments: [mockAttachment] };

      mockPrismaService.emailTemplate.findUnique
        .mockResolvedValueOnce(templateWithAttachments)
        .mockResolvedValueOnce({ ...mockTemplate, id: 'tmpl-copy', attachments: [] });

      mockPrismaService.emailTemplate.create.mockResolvedValue({
        ...mockTemplate,
        id: 'tmpl-copy',
        attachments: [],
      });

      mockStorageProvider.download.mockRejectedValue(new Error('Storage error'));

      // Should not throw even when attachment copy fails
      const result = await service.duplicate('tmpl-1', mockUser);
      expect(result).toBeDefined();
    });
  });

  describe('getTypes', () => {
    it('should return a list of template types with labels and placeholders', () => {
      const result = service.getTypes();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({
        type: expect.any(String),
        label: expect.any(String),
        placeholders: expect.any(Array),
      });
    });

    it('should include OFFERTE_VERSTUURD type', () => {
      const result = service.getTypes();
      const offerteType = result.find((t) => t.type === 'OFFERTE_VERSTUURD');

      expect(offerteType).toBeDefined();
      expect(offerteType!.label).toBe('Offerte verstuurd');
    });
  });

  describe('preview', () => {
    it('should render a preview with sample variables and wrap in email layout', () => {
      const result = service.preview({
        subject: 'Offerte {{offerte.nummer}}',
        bodyHtml: '<p>Geachte {{contact.voornaam}}</p>',
        type: EmailTemplateType.OFFERTE_VERSTUURD,
      });

      expect(result.subject).toContain('OFF-2026-001');
      expect(result.html).toContain('Jan');
      expect(result.html).toContain('InspeXi Beheer');
    });

    it('should remove unreplaced placeholders from preview', () => {
      const result = service.preview({
        subject: 'Test {{unknown.field}}',
        bodyHtml: '<p>{{unknown.field}}</p>',
        type: EmailTemplateType.OFFERTE_VERSTUURD,
      });

      expect(result.subject).not.toContain('{{');
      expect(result.html).not.toContain('{{');
    });
  });

  describe('getActiveTemplate', () => {
    it('should return the active template for an org and type', async () => {
      mockPrismaService.emailTemplate.findFirst.mockResolvedValue(mockTemplate);

      const result = await service.getActiveTemplate('org-1', EmailTemplateType.OFFERTE_VERSTUURD);

      expect(result).toEqual(mockTemplate);
      expect(mockPrismaService.emailTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 'org-1', type: EmailTemplateType.OFFERTE_VERSTUURD, isActive: true },
        }),
      );
    });

    it('should return null when no active template exists', async () => {
      mockPrismaService.emailTemplate.findFirst.mockResolvedValue(null);

      const result = await service.getActiveTemplate('org-1', EmailTemplateType.CONTACT_EMAIL);

      expect(result).toBeNull();
    });
  });

  describe('tryRender', () => {
    it('should return rendered subject and html when active template exists', async () => {
      mockPrismaService.emailTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        subject: 'Offerte {{offerte.nummer}}',
        bodyHtml: '<p>Geachte {{contact.voornaam}}</p>',
      });

      const result = await service.tryRender(
        'org-1',
        EmailTemplateType.OFFERTE_VERSTUURD,
        { offerte: { nummer: 'OFF-001' }, contact: { voornaam: 'Test' } },
        'Mijn Bedrijf',
      );

      expect(result).not.toBeNull();
      expect(result!.subject).toBe('Offerte OFF-001');
      expect(result!.html).toContain('Geachte Test');
      expect(result!.html).toContain('Mijn Bedrijf');
    });

    it('should return null when no active template exists', async () => {
      mockPrismaService.emailTemplate.findFirst.mockResolvedValue(null);

      const result = await service.tryRender(
        'org-1',
        EmailTemplateType.OFFERTE_VERSTUURD,
        {},
      );

      expect(result).toBeNull();
    });
  });

  describe('tryRenderById', () => {
    it('should return rendered content for active template by ID', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        subject: 'Afspraak op {{afspraak.datum}}',
        bodyHtml: '<p>Uw afspraak: {{afspraak.locatie}}</p>',
        isActive: true,
      });

      const result = await service.tryRenderById(
        'tmpl-1',
        { afspraak: { datum: '1 april 2026', locatie: 'Amsterdam' } },
        'Bedrijf BV',
      );

      expect(result).not.toBeNull();
      expect(result!.subject).toBe('Afspraak op 1 april 2026');
      expect(result!.html).toContain('Amsterdam');
    });

    it('should return null when template does not exist', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(null);

      const result = await service.tryRenderById('nonexistent', {});

      expect(result).toBeNull();
    });

    it('should return null when template is not active', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      });

      const result = await service.tryRenderById('tmpl-1', {});

      expect(result).toBeNull();
    });
  });

  describe('getAttachments', () => {
    it('should return attachments for a template', async () => {
      const attachments = [{ id: 'att-1', originalName: 'doc.pdf', emailTemplateId: 'tmpl-1' }];
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplateAttachment.findMany.mockResolvedValue(attachments);

      const result = await service.getAttachments('tmpl-1', mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].originalName).toBe('doc.pdf');
    });

    it('should throw ForbiddenException for cross-org template', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        orgId: 'other-org',
      });

      await expect(service.getAttachments('tmpl-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('uploadAttachment', () => {
    it('should upload an attachment and create a record', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockStorageProvider.upload.mockResolvedValue(undefined);
      mockPrismaService.emailTemplateAttachment.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      const createdAtt = { id: 'att-new', originalName: 'test.pdf', emailTemplateId: 'tmpl-1' };
      mockPrismaService.emailTemplateAttachment.create.mockResolvedValue(createdAtt);

      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('pdf'),
        size: 100,
      } as Express.Multer.File;

      const result = await service.uploadAttachment('tmpl-1', file, mockUser);

      expect(mockStorageProvider.upload).toHaveBeenCalled();
      expect(mockPrismaService.emailTemplateAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailTemplateId: 'tmpl-1',
            originalName: 'test.pdf',
            mimeType: 'application/pdf',
            sortOrder: 1,
          }),
        }),
      );
      expect(result.id).toBe('att-new');
    });

    it('should throw BadRequestException for disallowed MIME type', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);

      const file = {
        originalname: 'script.exe',
        mimetype: 'application/x-msdownload',
        buffer: Buffer.from('exe'),
        size: 100,
      } as Express.Multer.File;

      await expect(service.uploadAttachment('tmpl-1', file, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should assign sortOrder 0 when no existing attachments', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockStorageProvider.upload.mockResolvedValue(undefined);
      mockPrismaService.emailTemplateAttachment.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrismaService.emailTemplateAttachment.create.mockResolvedValue({ id: 'att-1' });

      const file = {
        originalname: 'first.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('pdf'),
        size: 50,
      } as Express.Multer.File;

      await service.uploadAttachment('tmpl-1', file, mockUser);

      expect(mockPrismaService.emailTemplateAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 0 }),
        }),
      );
    });
  });

  describe('downloadAttachment', () => {
    it('should return buffer and attachment metadata', async () => {
      const attachment = {
        id: 'att-1',
        emailTemplateId: 'tmpl-1',
        storageKey: 'org-1/et/tmpl-1/file.pdf',
        originalName: 'file.pdf',
        mimeType: 'application/pdf',
      };
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplateAttachment.findUnique.mockResolvedValue(attachment);
      mockStorageProvider.download.mockResolvedValue(Buffer.from('pdf content'));

      const result = await service.downloadAttachment('tmpl-1', 'att-1', mockUser);

      expect(result.buffer).toBeDefined();
      expect(result.attachment.originalName).toBe('file.pdf');
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplateAttachment.findUnique.mockResolvedValue(null);

      await expect(service.downloadAttachment('tmpl-1', 'nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when attachment belongs to different template', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplateAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        emailTemplateId: 'other-tmpl',
      });

      await expect(service.downloadAttachment('tmpl-1', 'att-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteAttachment', () => {
    it('should delete the attachment from storage and database', async () => {
      const attachment = {
        id: 'att-1',
        emailTemplateId: 'tmpl-1',
        storageKey: 'org-1/et/tmpl-1/file.pdf',
      };
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplateAttachment.findUnique.mockResolvedValue(attachment);
      mockStorageProvider.delete.mockResolvedValue(undefined);
      mockPrismaService.emailTemplateAttachment.delete.mockResolvedValue({});

      await service.deleteAttachment('tmpl-1', 'att-1', mockUser);

      expect(mockStorageProvider.delete).toHaveBeenCalledWith('org-1/et/tmpl-1/file.pdf');
      expect(mockPrismaService.emailTemplateAttachment.delete).toHaveBeenCalledWith({
        where: { id: 'att-1' },
      });
    });

    it('should still delete database record even if storage delete fails', async () => {
      const attachment = {
        id: 'att-1',
        emailTemplateId: 'tmpl-1',
        storageKey: 'org-1/et/tmpl-1/file.pdf',
      };
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplateAttachment.findUnique.mockResolvedValue(attachment);
      mockStorageProvider.delete.mockRejectedValue(new Error('Storage error'));
      mockPrismaService.emailTemplateAttachment.delete.mockResolvedValue({});

      await service.deleteAttachment('tmpl-1', 'att-1', mockUser);

      expect(mockPrismaService.emailTemplateAttachment.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      mockPrismaService.emailTemplate.findUnique.mockResolvedValue(mockTemplate);
      mockPrismaService.emailTemplateAttachment.findUnique.mockResolvedValue(null);

      await expect(service.deleteAttachment('tmpl-1', 'nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAttachmentsForSending', () => {
    it('should return buffers for all attachments', async () => {
      const attachments = [
        { id: 'att-1', storageKey: 'k1', originalName: 'a.pdf' },
        { id: 'att-2', storageKey: 'k2', originalName: 'b.pdf' },
      ];
      mockPrismaService.emailTemplateAttachment.findMany.mockResolvedValue(attachments);
      mockStorageProvider.download
        .mockResolvedValueOnce(Buffer.from('content1'))
        .mockResolvedValueOnce(Buffer.from('content2'));

      const result = await service.getAttachmentsForSending('tmpl-1');

      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('a.pdf');
      expect(result[1].filename).toBe('b.pdf');
    });

    it('should skip attachment if storage download fails', async () => {
      const attachments = [
        { id: 'att-1', storageKey: 'k1', originalName: 'a.pdf' },
      ];
      mockPrismaService.emailTemplateAttachment.findMany.mockResolvedValue(attachments);
      mockStorageProvider.download.mockRejectedValue(new Error('Storage error'));

      const result = await service.getAttachmentsForSending('tmpl-1');

      expect(result).toHaveLength(0);
    });

    it('should return empty array when no attachments exist', async () => {
      mockPrismaService.emailTemplateAttachment.findMany.mockResolvedValue([]);

      const result = await service.getAttachmentsForSending('tmpl-1');

      expect(result).toHaveLength(0);
    });
  });
});
