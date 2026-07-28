import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, Role, User, QuoteStatus, RequestStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { QuotesService } from './quotes.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { EmailTemplatesService } from '@/modules/email-templates/email-templates.service';
import { NumberingService } from '@/modules/numbering/numbering.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { PdfService } from './pdf.service';
import { QuotePdfService } from './quote-pdf.service';

describe('QuotesService', () => {
  let service: QuotesService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Admin',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockSuperuser = {
    id: 'su-1',
    orgId: null,
    email: 'superuser@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Super',
    lastName: 'User',
    roles: [Role.SUPERUSER],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockOtherOrgUser = {
    id: 'user-other',
    orgId: 'org-2',
    email: 'other@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Other',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const year = new Date().getFullYear();

  const mockQuote = {
    id: 'quote-1',
    orgId: 'org-1',
    quoteNumber: `OFF-${year}-0001`,
    templateId: null,
    requestId: null,
    contactId: 'contact-1',
    locationId: null,
    status: QuoteStatus.CONCEPT,
    subject: 'NEN1010 inspectie kantoorpand',
    coverBlocks: null,
    contentBlocks: null,
    closingBlocks: null,
    subtotal: 0,
    discountTotal: 0,
    vatTotal: 0,
    total: 0,
    validUntil: new Date('2025-02-01'),
    requiresApproval: false,
    internalNotes: null,
    createdBy: 'user-1',
    sentAt: null,
    viewedAt: null,
    signedAt: null,
    clientSignature: null,
    clientIp: null,
    clientUserAgent: null,
    managerSignature: null,
    publicToken: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockQuoteWithIncludes = {
    ...mockQuote,
    contact: {
      id: 'contact-1',
      type: 'COMPANY',
      companyName: 'Acme B.V.',
      firstName: 'Jan',
      lastName: 'Jansen',
      email: 'jan@acme.nl',
    },
    location: null,
    request: null,
    template: null,
    createdByUser: {
      id: 'user-1',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
    },
    lines: [],
    approvalRequests: [],
  };

  const mockContact = {
    id: 'contact-1',
    orgId: 'org-1',
    isDeleted: false,
  };

  const mockLocation = {
    id: 'location-1',
    contactId: 'contact-1',
  };

  const mockTemplate = {
    id: 'template-1',
    orgId: 'org-1',
    name: 'Standaard Template',
    coverBlocks: [{ type: 'text', content: 'Cover' }],
    contentBlocks: [{ type: 'text', content: 'Content' }],
    closingBlocks: [{ type: 'text', content: 'Closing' }],
    defaultValidityDays: 14,
    requiresApproval: true,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockOrganization = {
    id: 'org-1',
    defaultValidityDays: 45,
  };

  const mockProduct = {
    id: 'product-1',
    orgId: 'org-1',
    name: 'NEN1010 Inspectie',
    unit: 'uur',
    category: 'INSPECTIE',
    defaultVat: 21,
  };

  const mockRequest = {
    id: 'request-1',
    orgId: 'org-1',
    contactId: 'contact-1',
    locationId: 'location-1',
    title: 'NEN1010 keuring kantoorpand',
    status: RequestStatus.IN_BEHANDELING,
    isDeleted: false,
    createdBy: 'user-1',
  };

  // Transaction mock: executes the callback with a mock tx object
  const mockTx = {
    quote: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    quoteLine: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    quoteApprovalRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    request: {
      update: jest.fn(),
    },
    requestStatusHistory: {
      create: jest.fn(),
    },
  };

  const mockPrismaService = {
    quote: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    quoteAttachment: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    contact: {
      findUnique: jest.fn(),
    },
    location: {
      findUnique: jest.fn(),
    },
    quoteTemplate: {
      findUnique: jest.fn(),
    },
    projectPhase: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    product: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    contactPriceTable: {
      findMany: jest.fn(),
    },
    priceTable: {
      findFirst: jest.fn(),
    },
    request: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
  };

  // Invokes the create callback with the transaction mock + a deterministic
  // generated number so the service's create path runs exactly as in production
  // (minus the real numbering engine and its own $transaction wrapper).
  const mockNumberingService = {
    runWithGeneratedNumber: jest.fn(async (_model, _orgId, _opts, create) =>
      create(mockTx, 'OFF-2026-0001'),
    ),
    validateManualNumber: jest.fn(async (_o, _m, value: string) => value.trim()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: NotificationsService,
          useValue: { dispatch: jest.fn() },
        },
        {
          provide: EmailService,
          useValue: { sendQuoteEmail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, def?: string) => def) },
        },
        {
          provide: STORAGE_PROVIDER,
          useValue: {
            upload: jest.fn(),
            download: jest.fn(),
            delete: jest.fn(),
            exists: jest.fn(),
          },
        },
        {
          provide: CustomFieldsValidator,
          useValue: { validateAndSanitize: jest.fn().mockResolvedValue(null) },
        },
        { provide: PdfService, useValue: {} },
        { provide: QuotePdfService, useValue: {} },
        { provide: EmailTemplatesService, useValue: {} },
        { provide: NumberingService, useValue: mockNumberingService },
        {
          provide: EntitlementsService,
          useValue: { assertFeature: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return paginated results with correct structure', async () => {
      const quotes = [mockQuote];
      mockPrismaService.quote.findMany.mockResolvedValue(quotes);
      mockPrismaService.quote.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(result).toEqual({ data: quotes, total: 1, page: 1, limit: 20 });
      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
          }),
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(mockPrismaService.quote.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          orgId: 'org-1',
        }),
      });
    });

    it('should filter by search term using OR on subject, quoteNumber, contact name', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);
      mockPrismaService.quote.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        search: 'inspectie',
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
            OR: [
              { subject: { contains: 'inspectie', mode: 'insensitive' } },
              { quoteNumber: { contains: 'inspectie', mode: 'insensitive' } },
              {
                contact: {
                  OR: [
                    {
                      companyName: {
                        contains: 'inspectie',
                        mode: 'insensitive',
                      },
                    },
                    {
                      firstName: {
                        contains: 'inspectie',
                        mode: 'insensitive',
                      },
                    },
                    {
                      lastName: {
                        contains: 'inspectie',
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            ],
          }),
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);
      mockPrismaService.quote.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        status: QuoteStatus.GOEDGEKEURD,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: QuoteStatus.GOEDGEKEURD,
          }),
        }),
      );
    });

    it('should bypass org-scoping for SUPERUSER', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);
      mockPrismaService.quote.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 });

      const call = mockPrismaService.quote.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by templateId', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);
      mockPrismaService.quote.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        templateId: 'template-1',
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            templateId: 'template-1',
          }),
        }),
      );
    });

    it("should filter quotes without a template when templateId is 'none'", async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);
      mockPrismaService.quote.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        templateId: 'none',
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            templateId: null,
          }),
        }),
      );
    });

    it('should include the template (id + name) in list results', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);
      mockPrismaService.quote.count.mockResolvedValue(0);

      await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            template: { select: { id: true, name: true } },
          }),
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return quote with all includes', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        mockQuoteWithIncludes,
      );
      mockPrismaService.organization.findUnique.mockResolvedValue({
        quoteApprovalThreshold: null,
        quoteApprovalRequiredRole: null,
      });

      const result = await service.findOne('quote-1', mockUser);

      // B-304: findOne serialiseert de effectieve goedkeuringsplicht mee.
      expect(result).toEqual({ ...mockQuoteWithIncludes, approvalRequired: false });
      expect(mockPrismaService.quote.findFirst).toHaveBeenCalledWith({
        where: { id: 'quote-1', orgId: 'org-1' },
        include: expect.objectContaining({
          contact: expect.any(Object),
          location: expect.any(Object),
          request: expect.any(Object),
          template: expect.any(Object),
          createdByUser: expect.any(Object),
          lines: expect.any(Object),
          approvalRequests: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException when quote not found', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Offerte niet gevonden');
    });

    it('should throw the same NotFound when different org (WP-C1: 404-oracle)', async () => {
      // Org-scope in de where-clausule: andermans offerte komt niet terug.
      mockPrismaService.quote.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('quote-1', mockOtherOrgUser),
      ).rejects.toThrow('Offerte niet gevonden');
      expect(mockPrismaService.quote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-2' }),
        }),
      );
    });

    it('serializes approvalRequired=true when the total exceeds the org threshold (B-304)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        total: 30250,
        requiresApproval: false, // template-vlag uit — de drempel alleen is de trigger
      });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        quoteApprovalThreshold: 10000,
        quoteApprovalRequiredRole: Role.MANAGER,
      });

      const result = await service.findOne('quote-1', mockUser);

      expect(result.approvalRequired).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create()', () => {
    const createDto = {
      contactId: 'contact-1',
      subject: 'NEN1010 inspectie kantoorpand',
    };

    it('should generate sequential quote number (OFF-YYYY-XXXX)', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );
      mockTx.quote.findFirst.mockResolvedValue({
        quoteNumber: `OFF-${year}-0005`,
      });
      const createdQuote = {
        ...mockQuote,
        quoteNumber: `OFF-${year}-0001`,
      };
      mockTx.quote.create.mockResolvedValue(createdQuote);

      const result = await service.create(createDto, mockUser);

      expect(result.quoteNumber).toBe(`OFF-${year}-0001`);
      expect(mockTx.quote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-1',
          quoteNumber: `OFF-${year}-0001`,
          contactId: 'contact-1',
          subject: 'NEN1010 inspectie kantoorpand',
          createdBy: 'user-1',
        }),
      });
    });

    it('should inherit template fields (coverBlocks, contentBlocks, closingBlocks, requiresApproval)', async () => {
      const dtoWithTemplate = {
        ...createDto,
        templateId: 'template-1',
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue(
        mockTemplate,
      );
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );
      mockTx.quote.findFirst.mockResolvedValue(null);
      mockTx.quote.create.mockResolvedValue({
        ...mockQuote,
        quoteNumber: `OFF-${year}-0001`,
        coverBlocks: mockTemplate.coverBlocks,
        contentBlocks: mockTemplate.contentBlocks,
        closingBlocks: mockTemplate.closingBlocks,
        requiresApproval: true,
      });

      await service.create(dtoWithTemplate, mockUser);

      expect(mockTx.quote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          coverBlocks: mockTemplate.coverBlocks,
          contentBlocks: mockTemplate.contentBlocks,
          closingBlocks: mockTemplate.closingBlocks,
          requiresApproval: true,
          templateId: 'template-1',
        }),
      });
    });

    it('should calculate validUntil from template defaultValidityDays when no explicit date', async () => {
      const dtoWithTemplate = {
        ...createDto,
        templateId: 'template-1',
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue(
        mockTemplate,
      );
      // Note: when template has defaultValidityDays, org lookup still happens but template value takes precedence
      mockPrismaService.organization.findUnique.mockResolvedValue(
        mockOrganization,
      );
      mockTx.quote.findFirst.mockResolvedValue(null);
      mockTx.quote.create.mockResolvedValue(mockQuote);

      await service.create(dtoWithTemplate, mockUser);

      const createCall = mockTx.quote.create.mock.calls[0][0];
      const validUntil = createCall.data.validUntil as Date;
      // Template has 14 days, so validUntil should be ~14 days from now
      const now = new Date();
      const diff = Math.round(
        (validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diff).toBeGreaterThanOrEqual(13);
      expect(diff).toBeLessThanOrEqual(14);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should only allow update when CONCEPT status', async () => {
      const nonConceptQuote = {
        ...mockQuoteWithIncludes,
        status: QuoteStatus.GOEDGEKEURD,
      };
      mockPrismaService.quote.findFirst.mockResolvedValue(nonConceptQuote);

      await expect(
        service.update('quote-1', { subject: 'Nieuwe titel' }, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('quote-1', { subject: 'Nieuwe titel' }, mockUser),
      ).rejects.toThrow(
        'Alleen offertes met status CONCEPT kunnen bewerkt worden',
      );
    });

    // PRD-12: fase-koppelen is de uitzondering op de CONCEPT-guard.
    it('should allow a phase-link-only patch on a non-CONCEPT quote', async () => {
      const nonConceptQuote = {
        ...mockQuoteWithIncludes,
        status: QuoteStatus.VERSTUURD,
      };
      mockPrismaService.quote.findFirst.mockResolvedValue(nonConceptQuote);
      mockPrismaService.projectPhase.findUnique.mockResolvedValue({
        orgId: mockUser.orgId,
        projectId: 'project-1',
        isDeleted: false,
      });
      mockPrismaService.quote.update.mockResolvedValue({
        ...mockQuote,
        projectPhaseId: 'phase-1',
      });

      await service.update('quote-1', { projectPhaseId: 'phase-1' }, mockUser);

      expect(mockPrismaService.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectPhaseId: 'phase-1' }),
        }),
      );
    });

    it('should allow unlinking the phase (projectPhaseId: null) on a non-CONCEPT quote', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        status: QuoteStatus.GEACCEPTEERD,
        projectPhaseId: 'phase-1',
      });
      mockPrismaService.quote.update.mockResolvedValue({
        ...mockQuote,
        projectPhaseId: null,
      });

      await service.update('quote-1', { projectPhaseId: null }, mockUser);

      expect(mockPrismaService.projectPhase.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectPhaseId: null }),
        }),
      );
    });

    it('should still block other fields alongside projectPhaseId on a non-CONCEPT quote', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        status: QuoteStatus.VERSTUURD,
      });

      await expect(
        service.update(
          'quote-1',
          { projectPhaseId: 'phase-1', subject: 'Nieuwe titel' },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.quote.update).not.toHaveBeenCalled();
    });

    it('should update fields when status is CONCEPT', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        mockQuoteWithIncludes,
      );
      const updatedQuote = {
        ...mockQuote,
        subject: 'Bijgewerkte titel',
        internalNotes: 'Notitie',
      };
      mockPrismaService.quote.update.mockResolvedValue(updatedQuote);

      const result = await service.update(
        'quote-1',
        { subject: 'Bijgewerkte titel', internalNotes: 'Notitie' },
        mockUser,
      );

      expect(result.subject).toBe('Bijgewerkte titel');
      expect(result.internalNotes).toBe('Notitie');
      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          subject: 'Bijgewerkte titel',
          internalNotes: 'Notitie',
        },
      });
    });

    // ─── template switch (REQ26) ──────────────────────────────────────

    it('should switch to a BLOCKS template: re-apply blocks + requiresApproval + templateId', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(mockQuoteWithIncludes);
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        templateType: 'BLOCKS',
      });
      mockPrismaService.quote.update.mockResolvedValue(mockQuote);

      await service.update('quote-1', { templateId: 'template-1' }, mockUser);

      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          templateId: 'template-1',
          coverBlocks: mockTemplate.coverBlocks,
          contentBlocks: mockTemplate.contentBlocks,
          closingBlocks: mockTemplate.closingBlocks,
          requiresApproval: true,
        },
      });
    });

    it('should switch to a DOCX template: clear blocks + apply requiresApproval', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(mockQuoteWithIncludes);
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        templateType: 'DOCX',
        requiresApproval: false,
      });
      mockPrismaService.quote.update.mockResolvedValue(mockQuote);

      await service.update('quote-1', { templateId: 'template-1' }, mockUser);

      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          templateId: 'template-1',
          coverBlocks: Prisma.DbNull,
          contentBlocks: Prisma.DbNull,
          closingBlocks: Prisma.DbNull,
          requiresApproval: false,
        },
      });
    });

    it('should unlink the template (templateId null) without touching blocks', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        templateId: 'template-1',
      });
      mockPrismaService.quote.update.mockResolvedValue(mockQuote);

      await service.update('quote-1', { templateId: null }, mockUser);

      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { templateId: null, requiresApproval: false },
      });
      // No template lookup needed when unlinking
      expect(mockPrismaService.quoteTemplate.findUnique).not.toHaveBeenCalled();
    });

    it('should be a no-op when templateId is unchanged', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        templateId: 'template-1',
      });
      mockPrismaService.quote.update.mockResolvedValue(mockQuote);

      await service.update('quote-1', { templateId: 'template-1', subject: 'X' }, mockUser);

      expect(mockPrismaService.quoteTemplate.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { subject: 'X' },
      });
    });

    it('should reject a cross-org template (Forbidden)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(mockQuoteWithIncludes);
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        orgId: 'org-2',
        templateType: 'BLOCKS',
      });

      await expect(
        service.update('quote-1', { templateId: 'template-1' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.quote.update).not.toHaveBeenCalled();
    });

    it('should reject an inactive/missing template (NotFound)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(mockQuoteWithIncludes);
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      });

      await expect(
        service.update('quote-1', { templateId: 'template-1' }, mockUser),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.quote.update).not.toHaveBeenCalled();
    });

    it('should not allow switching templates outside CONCEPT', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        status: QuoteStatus.GOEDGEKEURD,
      });

      await expect(
        service.update('quote-1', { templateId: 'template-1' }, mockUser),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.quoteTemplate.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus (REQ26 guard) ───────────────────────────────────────

  describe('updateStatus()', () => {
    it('should block leaving CONCEPT without a linked template', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        templateId: null,
        status: QuoteStatus.CONCEPT,
      });

      await expect(
        service.updateStatus('quote-1', QuoteStatus.GOEDGEKEURD, mockUser),
      ).rejects.toThrow('Koppel eerst een offertesjabloon');
      expect(mockPrismaService.quote.update).not.toHaveBeenCalled();
    });

    it('should allow leaving CONCEPT when a template is linked', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...mockQuoteWithIncludes,
        templateId: 'template-1',
        status: QuoteStatus.CONCEPT,
      });
      mockPrismaService.quote.update.mockResolvedValue({
        ...mockQuote,
        templateId: 'template-1',
        status: QuoteStatus.GOEDGEKEURD,
      });

      const result = await service.updateStatus('quote-1', QuoteStatus.GOEDGEKEURD, mockUser);

      expect(result.status).toBe(QuoteStatus.GOEDGEKEURD);
      expect(mockPrismaService.quote.update).toHaveBeenCalled();
    });
  });

  // ─── sendQuote (B-308 idempotency + B-315 lege offerte) ──────────────

  describe('sendQuote()', () => {
    const sendDto = { to: 'klant@example.com', subject: 'Offerte', bodyText: 'Zie bijlage' };
    // GOEDGEKEURD → geen template-guard; publicToken gezet → geen token-update.
    const sendableQuote = {
      ...mockQuoteWithIncludes,
      status: QuoteStatus.GOEDGEKEURD,
      publicToken: 'token-1',
      lines: [{ id: 'line-1', description: 'Dienst', quantity: 1, unitPrice: 100, vatRate: 21, discountPct: 0, lineTotal: 100 }],
    };
    let emailService: { sendQuoteEmail: jest.Mock };

    beforeEach(() => {
      emailService = (service as any).emailService;
      mockPrismaService.organization.findUnique.mockResolvedValue({
        quoteApprovalThreshold: null,
        quoteApprovalRequiredRole: null,
        name: 'Org',
        senderName: null,
        senderEmail: null,
      });
      mockPrismaService.quote.findFirst.mockResolvedValue(sendableQuote);
      mockPrismaService.quote.update.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.VERSTUURD,
      });
    });

    it('rejects when the quote was already sent (sentAt set)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...sendableQuote,
        sentAt: new Date('2026-07-01'),
        status: QuoteStatus.VERSTUURD,
      });

      await expect(service.sendQuote('quote-1', sendDto, mockUser)).rejects.toThrow(
        'Deze offerte is al verstuurd',
      );
      expect(emailService.sendQuoteEmail).not.toHaveBeenCalled();
    });

    it('rejects a quote without lines (B-315, NL-melding)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue({
        ...sendableQuote,
        lines: [],
      });

      await expect(service.sendQuote('quote-1', sendDto, mockUser)).rejects.toThrow(
        'Deze offerte heeft geen offerteregels',
      );
      expect(mockPrismaService.quote.updateMany).not.toHaveBeenCalled();
      expect(emailService.sendQuoteEmail).not.toHaveBeenCalled();
    });

    it('claims atomically before mailing and finalizes the status afterwards', async () => {
      mockPrismaService.quote.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.sendQuote('quote-1', sendDto, mockUser);

      expect(result.status).toBe(QuoteStatus.VERSTUURD);
      // Claim: conditionele updateMany op sentAt=null + status CONCEPT/GOEDGEKEURD.
      expect(mockPrismaService.quote.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'quote-1',
          orgId: 'org-1',
          sentAt: null,
          status: { in: [QuoteStatus.CONCEPT, QuoteStatus.GOEDGEKEURD] },
        },
        data: { sentAt: expect.any(Date) },
      });
      expect(emailService.sendQuoteEmail).toHaveBeenCalledTimes(1);
      // Statusovergang → VERSTUURD via de geauditeerde update (zonder sentAt — al geclaimd).
      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { status: QuoteStatus.VERSTUURD },
      });
    });

    it('parallel Promise.all: exactly one wins, one gets 400, e-mail exactly once (B-308)', async () => {
      // Echte claim-semantiek: de eerste conditionele update "wint" (count 1),
      // elke volgende matcht niets meer (count 0) — zoals één atomisch UPDATE in Postgres.
      let claimed = false;
      mockPrismaService.quote.updateMany.mockImplementation(async ({ where }: any) => {
        if (where.sentAt === null) {
          if (claimed) return { count: 0 };
          claimed = true;
          return { count: 1 };
        }
        return { count: 1 }; // revert-pad (niet verwacht in deze test)
      });

      const results = await Promise.allSettled([
        service.sendQuote('quote-1', sendDto, mockUser),
        service.sendQuote('quote-1', sendDto, mockUser),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
      expect(rejected[0].reason.message).toBe('Deze offerte is al verstuurd');
      // De kern van B-308: exact één klant-e-mail.
      expect(emailService.sendQuoteEmail).toHaveBeenCalledTimes(1);
    });

    it('reverts the claim when mailing fails so the quote can be re-sent', async () => {
      mockPrismaService.quote.updateMany.mockResolvedValue({ count: 1 });
      emailService.sendQuoteEmail.mockRejectedValueOnce(new Error('SMTP down'));

      await expect(service.sendQuote('quote-1', sendDto, mockUser)).rejects.toThrow('SMTP down');

      // Tweede updateMany = revert van de claim (sentAt terug naar null).
      const calls = mockPrismaService.quote.updateMany.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toEqual({
        where: { id: 'quote-1', sentAt: expect.any(Date) },
        data: { sentAt: null },
      });
      // Status is nooit op VERSTUURD gezet.
      expect(mockPrismaService.quote.update).not.toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { status: QuoteStatus.VERSTUURD },
      });
    });
  });

  // ─── setLines ────────────────────────────────────────────────────────

  describe('setLines()', () => {
    const linesDto = {
      lines: [
        {
          description: 'NEN1010 Inspectie',
          quantity: 3,
          unit: 'uur',
          unitPrice: 85,
          vatRate: 21,
          discountPct: 10,
        },
        {
          description: 'Voorrijkosten',
          quantity: 1,
          unit: 'stuk',
          unitPrice: 50,
          vatRate: 21,
          discountPct: 0,
        },
      ],
    };

    it('should calculate lineTotal per line (qty * unitPrice * (1 - discountPct/100))', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        mockQuoteWithIncludes,
      );
      mockTx.quoteLine.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.quoteLine.createMany.mockResolvedValue({ count: 2 });
      mockTx.quote.update.mockResolvedValue(mockQuote);

      await service.setLines('quote-1', linesDto, mockUser);

      const createManyCall = mockTx.quoteLine.createMany.mock.calls[0][0];
      // Line 1: 3 * 85 * (1 - 10/100) = 3 * 85 * 0.9 = 229.5
      expect(createManyCall.data[0].lineTotal).toBe(229.5);
      // Line 2: 1 * 50 * (1 - 0/100) = 50
      expect(createManyCall.data[1].lineTotal).toBe(50);
    });

    it('should recalculate quote totals (subtotal, vatTotal, discountTotal, total)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        mockQuoteWithIncludes,
      );
      mockTx.quoteLine.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.quoteLine.createMany.mockResolvedValue({ count: 2 });
      mockTx.quote.update.mockResolvedValue(mockQuote);

      await service.setLines('quote-1', linesDto, mockUser);

      // Line 1: lineTotal = 229.5, fullPrice = 255, discount = 25.5, vat = 229.5 * 21/100 = 48.195 => 48.2
      // Line 2: lineTotal = 50, fullPrice = 50, discount = 0, vat = 50 * 21/100 = 10.5
      // subtotal = 229.5 + 50 = 279.5
      // vatTotal = 48.2 + 10.5 = 58.7
      // discountTotal = 25.5 + 0 = 25.5
      // total = 279.5 + 58.7 = 338.2
      expect(mockTx.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: {
          subtotal: 279.5,
          vatTotal: 58.7,
          discountTotal: 25.5,
          total: 338.2,
        },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    it('should only allow setLines when status is CONCEPT', async () => {
      const nonConceptQuote = {
        ...mockQuoteWithIncludes,
        status: QuoteStatus.VERSTUURD,
      };
      mockPrismaService.quote.findFirst.mockResolvedValue(nonConceptQuote);

      await expect(
        service.setLines('quote-1', linesDto, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setLines('quote-1', linesDto, mockUser),
      ).rejects.toThrow(
        'Offerteregels kunnen alleen bij status CONCEPT gewijzigd worden',
      );
    });

    it('rejects a line total beyond numeric(12,2) with a Dutch 400 (B-303)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(mockQuoteWithIncludes);

      // 9.999.999 × 9.999 ≈ € 99,99 mld → boven de kolomgrens van € 9.999.999.999,99
      await expect(
        service.setLines(
          'quote-1',
          { lines: [{ description: 'Mega', quantity: 9_999_999, unit: 'stuks', unitPrice: 9_999, vatRate: 21, discountPct: 0 }] },
          mockUser,
        ),
      ).rejects.toThrow('Het regeltotaal van regel 1 is te groot');
      expect(mockTx.quoteLine.createMany).not.toHaveBeenCalled();
    });

    it('rejects an aggregate quote total beyond numeric(12,2) with a Dutch 400 (B-303)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(mockQuoteWithIncludes);

      // Twee regels van elk ± € 9,99 mld: per regel geldig, som > € 9.999.999.999,99
      const bigLine = { description: 'Groot', quantity: 999_999, unit: 'stuks', unitPrice: 9_999, vatRate: 21, discountPct: 0 };
      await expect(
        service.setLines('quote-1', { lines: [bigLine, { ...bigLine, description: 'Groot 2' }] }, mockUser),
      ).rejects.toThrow('Het offertetotaal is te groot');
      expect(mockTx.quoteLine.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── resolvePrice ────────────────────────────────────────────────────

  describe('resolvePrice()', () => {
    it('should return FIXED price from price table', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);
      mockPrismaService.contactPriceTable.findMany.mockResolvedValue([
        {
          priceTable: {
            items: [
              {
                productId: 'product-1',
                priceType: 'FIXED',
                basePrice: 95,
                tiers: [],
              },
            ],
          },
        },
      ]);

      const result = await service.resolvePrice(
        'product-1',
        'contact-1',
        1,
        mockUser,
      );

      expect(result).toEqual({
        unitPrice: 95,
        vatRate: 21,
        unit: 'uur',
        priceType: 'FIXED',
        tier: null,
      });
    });

    it('should return TIERED price with fallback to default table', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);
      // No contact-specific price table
      mockPrismaService.contactPriceTable.findMany.mockResolvedValue([]);
      // Default table with tiered pricing
      mockPrismaService.priceTable.findFirst.mockResolvedValue({
        items: [
          {
            productId: 'product-1',
            priceType: 'TIERED',
            basePrice: null,
            tiers: [
              { fromQty: 1, toQty: 5, price: 100 },
              { fromQty: 6, toQty: null, price: 80 },
            ],
          },
        ],
      });

      const result = await service.resolvePrice(
        'product-1',
        'contact-1',
        10,
        mockUser,
      );

      expect(result).toEqual({
        unitPrice: 80,
        vatRate: 21,
        unit: 'uur',
        priceType: 'TIERED',
        tier: { fromQty: 6, toQty: null },
      });
    });

    // B-309: staffelgrenzen — de tier moet exact op de overgang wisselen.
    describe('tier boundaries (B-309)', () => {
      beforeEach(() => {
        mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);
        mockPrismaService.contactPriceTable.findMany.mockResolvedValue([
          {
            priceTable: {
              items: [
                {
                  productId: 'product-1',
                  priceType: 'TIERED',
                  basePrice: null,
                  tiers: [
                    { fromQty: 1, toQty: 9, price: 12.5 },
                    { fromQty: 10, toQty: 49, price: 10 },
                    { fromQty: 50, toQty: null, price: 7.5 },
                  ],
                },
              ],
            },
          },
        ]);
      });

      it.each([
        [9, 12.5, { fromQty: 1, toQty: 9 }],
        [10, 10, { fromQty: 10, toQty: 49 }],
        [49, 10, { fromQty: 10, toQty: 49 }],
        [50, 7.5, { fromQty: 50, toQty: null }],
      ])('quantity %d resolves to unit price %d', async (quantity, expectedPrice, expectedTier) => {
        const result = await service.resolvePrice('product-1', 'contact-1', quantity as number, mockUser);

        expect(result.unitPrice).toBe(expectedPrice);
        expect(result.priceType).toBe('TIERED');
        expect(result.tier).toEqual(expectedTier);
      });
    });
  });

  // ─── createFromRequest ───────────────────────────────────────────────

  describe('createFromRequest()', () => {
    it('should create quote from request data', async () => {
      mockPrismaService.request.findFirst.mockResolvedValue(mockRequest);
      mockTx.quote.findFirst.mockResolvedValue(null);
      mockTx.organization.findUnique.mockResolvedValue(mockOrganization);
      const createdQuote = {
        ...mockQuote,
        requestId: 'request-1',
        subject: 'NEN1010 keuring kantoorpand',
        locationId: 'location-1',
      };
      mockTx.quote.create.mockResolvedValue(createdQuote);
      mockTx.request.update.mockResolvedValue({});
      mockTx.requestStatusHistory.create.mockResolvedValue({});

      const result = await service.createFromRequest('request-1', mockUser);

      expect(result.requestId).toBe('request-1');
      expect(result.subject).toBe('NEN1010 keuring kantoorpand');
      expect(mockTx.quote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-1',
          quoteNumber: `OFF-${year}-0001`,
          requestId: 'request-1',
          contactId: 'contact-1',
          locationId: 'location-1',
          subject: 'NEN1010 keuring kantoorpand',
          createdBy: 'user-1',
        }),
      });
    });

    it('should update request status to OFFERTE_GEMAAKT', async () => {
      mockPrismaService.request.findFirst.mockResolvedValue(mockRequest);
      mockTx.quote.findFirst.mockResolvedValue(null);
      mockTx.organization.findUnique.mockResolvedValue(mockOrganization);
      mockTx.quote.create.mockResolvedValue(mockQuote);
      mockTx.request.update.mockResolvedValue({});
      mockTx.requestStatusHistory.create.mockResolvedValue({});

      await service.createFromRequest('request-1', mockUser);

      expect(mockTx.request.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: { status: RequestStatus.OFFERTE_GEMAAKT },
      });
      expect(mockTx.requestStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'request-1',
          fromStatus: RequestStatus.IN_BEHANDELING,
          toStatus: RequestStatus.OFFERTE_GEMAAKT,
          changedBy: 'user-1',
        }),
      });
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should only allow deletion when CONCEPT status', async () => {
      const nonConceptQuote = {
        ...mockQuoteWithIncludes,
        status: QuoteStatus.VERSTUURD,
      };
      mockPrismaService.quote.findFirst.mockResolvedValue(nonConceptQuote);

      await expect(
        service.remove('quote-1', mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.remove('quote-1', mockUser),
      ).rejects.toThrow(
        'Alleen offertes met status CONCEPT kunnen verwijderd worden',
      );
    });
  });
});
