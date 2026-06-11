import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, User, QuoteStatus, RequestStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { QuotesService } from './quotes.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { PlanningService } from '@/modules/planning/planning.service';
import { ProjectsService } from '@/modules/projects/projects.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { DocxRendererService } from '@/modules/quote-templates/docx-renderer.service';
import { EmailTemplatesService } from '@/modules/email-templates/email-templates.service';
import { TasksService } from '@/modules/tasks/tasks.service';
import { PdfService } from './pdf.service';

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
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
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
    organization: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    contactPriceTable: {
      findMany: jest.fn(),
    },
    priceTable: {
      findFirst: jest.fn(),
    },
    request: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
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
        { provide: PlanningService, useValue: {} },
        { provide: ProjectsService, useValue: {} },
        {
          provide: CustomFieldsValidator,
          useValue: { validateAndSanitize: jest.fn().mockResolvedValue(null) },
        },
        { provide: DocxRendererService, useValue: {} },
        { provide: PdfService, useValue: {} },
        { provide: EmailTemplatesService, useValue: {} },
        { provide: TasksService, useValue: {} },
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
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return quote with all includes', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(
        mockQuoteWithIncludes,
      );

      const result = await service.findOne('quote-1', mockUser);

      expect(result).toEqual(mockQuoteWithIncludes);
      expect(mockPrismaService.quote.findUnique).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
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
      mockPrismaService.quote.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Offerte niet gevonden');
    });

    it('should throw ForbiddenException when different org (non-SUPERUSER)', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(
        mockQuoteWithIncludes,
      );

      await expect(
        service.findOne('quote-1', mockOtherOrgUser),
      ).rejects.toThrow(ForbiddenException);
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
        quoteNumber: `OFF-${year}-0006`,
      };
      mockTx.quote.create.mockResolvedValue(createdQuote);

      const result = await service.create(createDto, mockUser);

      expect(result.quoteNumber).toBe(`OFF-${year}-0006`);
      expect(mockTx.quote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-1',
          quoteNumber: `OFF-${year}-0006`,
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
      mockPrismaService.quote.findUnique.mockResolvedValue(nonConceptQuote);

      await expect(
        service.update('quote-1', { subject: 'Nieuwe titel' }, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('quote-1', { subject: 'Nieuwe titel' }, mockUser),
      ).rejects.toThrow(
        'Alleen offertes met status CONCEPT kunnen bewerkt worden',
      );
    });

    it('should update fields when status is CONCEPT', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(
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
      mockPrismaService.quote.findUnique.mockResolvedValue(
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
      mockPrismaService.quote.findUnique.mockResolvedValue(
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
      mockPrismaService.quote.findUnique.mockResolvedValue(nonConceptQuote);

      await expect(
        service.setLines('quote-1', linesDto, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setLines('quote-1', linesDto, mockUser),
      ).rejects.toThrow(
        'Offerteregels kunnen alleen bij status CONCEPT gewijzigd worden',
      );
    });
  });

  // ─── submitForApproval ───────────────────────────────────────────────

  describe('submitForApproval()', () => {
    it('should set TER_GOEDKEURING status and create QuoteApprovalRequest', async () => {
      const conceptQuoteRequiringApproval = {
        ...mockQuoteWithIncludes,
        requiresApproval: true,
      };
      mockPrismaService.quote.findUnique.mockResolvedValue(
        conceptQuoteRequiringApproval,
      );
      mockTx.quoteApprovalRequest.create.mockResolvedValue({});
      const updatedQuote = {
        ...mockQuote,
        status: QuoteStatus.TER_GOEDKEURING,
      };
      mockTx.quote.update.mockResolvedValue(updatedQuote);

      const result = await service.submitForApproval(
        'quote-1',
        { note: 'Graag beoordelen' },
        mockUser,
      );

      expect(result.status).toBe(QuoteStatus.TER_GOEDKEURING);
      expect(mockTx.quoteApprovalRequest.create).toHaveBeenCalledWith({
        data: {
          quoteId: 'quote-1',
          requestedBy: 'user-1',
          note: 'Graag beoordelen',
        },
      });
      expect(mockTx.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { status: QuoteStatus.TER_GOEDKEURING },
      });
    });

    it('should throw BadRequestException when quote does not require approval', async () => {
      // mockQuoteWithIncludes has requiresApproval: false
      mockPrismaService.quote.findUnique.mockResolvedValue(
        mockQuoteWithIncludes,
      );

      await expect(
        service.submitForApproval('quote-1', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.submitForApproval('quote-1', {}, mockUser),
      ).rejects.toThrow('Deze offerte vereist geen goedkeuring');
    });
  });

  // ─── approve / reject ────────────────────────────────────────────────

  describe('approve()', () => {
    it('should set GOEDGEKEURD status and update pending approval request', async () => {
      const terGoedkeuringQuote = {
        ...mockQuoteWithIncludes,
        status: QuoteStatus.TER_GOEDKEURING,
      };
      mockPrismaService.quote.findUnique.mockResolvedValue(
        terGoedkeuringQuote,
      );
      const pendingApproval = {
        id: 'approval-1',
        quoteId: 'quote-1',
        status: 'PENDING',
        note: null,
      };
      mockTx.quoteApprovalRequest.findFirst.mockResolvedValue(
        pendingApproval,
      );
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      const approvedQuote = {
        ...mockQuote,
        status: QuoteStatus.GOEDGEKEURD,
      };
      mockTx.quote.update.mockResolvedValue(approvedQuote);

      const result = await service.approve('quote-1', {}, mockUser);

      expect(result.status).toBe(QuoteStatus.GOEDGEKEURD);
      expect(mockTx.quoteApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedBy: 'user-1',
        }),
      });
    });
  });

  describe('reject()', () => {
    it('should set CONCEPT status back and update pending approval request', async () => {
      const terGoedkeuringQuote = {
        ...mockQuoteWithIncludes,
        status: QuoteStatus.TER_GOEDKEURING,
      };
      mockPrismaService.quote.findUnique.mockResolvedValue(
        terGoedkeuringQuote,
      );
      const pendingApproval = {
        id: 'approval-1',
        quoteId: 'quote-1',
        status: 'PENDING',
        note: null,
      };
      mockTx.quoteApprovalRequest.findFirst.mockResolvedValue(
        pendingApproval,
      );
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      const rejectedQuote = {
        ...mockQuote,
        status: QuoteStatus.CONCEPT,
      };
      mockTx.quote.update.mockResolvedValue(rejectedQuote);

      const result = await service.reject(
        'quote-1',
        { note: 'Prijs te hoog' },
        mockUser,
      );

      expect(result.status).toBe(QuoteStatus.CONCEPT);
      expect(mockTx.quoteApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-1' },
        data: expect.objectContaining({
          status: 'REJECTED',
          reviewedBy: 'user-1',
          note: 'Prijs te hoog',
        }),
      });
    });

    it('should require note for rejection (dto.note is used)', async () => {
      const terGoedkeuringQuote = {
        ...mockQuoteWithIncludes,
        status: QuoteStatus.TER_GOEDKEURING,
      };
      mockPrismaService.quote.findUnique.mockResolvedValue(
        terGoedkeuringQuote,
      );
      const pendingApproval = {
        id: 'approval-1',
        quoteId: 'quote-1',
        status: 'PENDING',
        note: null,
      };
      mockTx.quoteApprovalRequest.findFirst.mockResolvedValue(
        pendingApproval,
      );
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.CONCEPT,
      });

      await service.reject('quote-1', { note: 'Reden van afwijzing' }, mockUser);

      expect(mockTx.quoteApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-1' },
        data: expect.objectContaining({
          note: 'Reden van afwijzing',
        }),
      });
    });
  });

  // ─── resolvePrice ────────────────────────────────────────────────────

  describe('resolvePrice()', () => {
    it('should return FIXED price from price table', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
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
      });
    });

    it('should return TIERED price with fallback to default table', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
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
      });
    });
  });

  // ─── createFromRequest ───────────────────────────────────────────────

  describe('createFromRequest()', () => {
    it('should create quote from request data', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequest);
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
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequest);
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
      mockPrismaService.quote.findUnique.mockResolvedValue(nonConceptQuote);

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
