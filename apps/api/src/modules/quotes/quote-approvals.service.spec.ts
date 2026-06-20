import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Role, QuoteStatus } from '@prisma/client';
import { QuoteApprovalsService } from './quote-approvals.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

describe('QuoteApprovalsService', () => {
  let service: QuoteApprovalsService;

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

  // Transaction mock: executes the callback with a mock tx object
  const mockTx = {
    quote: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    quoteApprovalRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
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
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.user.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteApprovalsService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: NotificationsService,
          useValue: { dispatch: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<QuoteApprovalsService>(QuoteApprovalsService);
  });

  // ─── submitForApproval ───────────────────────────────────────────────

  describe('submitForApproval()', () => {
    it('should set TER_GOEDKEURING status and create QuoteApprovalRequest', async () => {
      const conceptQuoteRequiringApproval = {
        ...mockQuoteWithIncludes,
        templateId: 'template-1',
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
      // requiresApproval: false, but template is linked so the guard passes
      mockPrismaService.quote.findUnique.mockResolvedValue({
        ...mockQuoteWithIncludes,
        templateId: 'template-1',
      });

      await expect(
        service.submitForApproval('quote-1', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.submitForApproval('quote-1', {}, mockUser),
      ).rejects.toThrow('Deze offerte vereist geen goedkeuring');
    });

    it('should block submit-for-approval without a linked template (REQ26 guard)', async () => {
      // mockQuoteWithIncludes has templateId: null
      mockPrismaService.quote.findUnique.mockResolvedValue({
        ...mockQuoteWithIncludes,
        requiresApproval: true,
      });

      await expect(
        service.submitForApproval('quote-1', {}, mockUser),
      ).rejects.toThrow('Koppel eerst een offertesjabloon');
      expect(mockTx.quote.update).not.toHaveBeenCalled();
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
});
