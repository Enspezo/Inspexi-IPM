import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  Role,
  QuoteStatus,
  ApprovalKind,
  ApprovalStatus,
  NotificationType,
} from '@prisma/client';
import { QuoteApprovalsService } from './quote-approvals.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

describe('QuoteApprovalsService', () => {
  let service: QuoteApprovalsService;
  let notifications: { dispatch: jest.Mock };

  const makeUser = (roles: Role[], id = 'user-1') =>
    ({
      id,
      orgId: 'org-1',
      email: `${id}@test.com`,
      firstName: 'Test',
      lastName: 'User',
      roles,
      isActive: true,
    } as any);

  const adminUser = makeUser([Role.ORG_ADMIN], 'user-1');
  const managerUser = makeUser([Role.MANAGER], 'manager-1');
  const backofficeUser = makeUser([Role.BACKOFFICE], 'backoffice-1');

  const year = new Date().getFullYear();

  const baseQuote = {
    id: 'quote-1',
    orgId: 'org-1',
    quoteNumber: `OFF-${year}-0001`,
    templateId: null as string | null,
    status: QuoteStatus.CONCEPT,
    subject: 'NEN1010 inspectie',
    total: 5000,
    requiresApproval: false,
    createdBy: 'user-1',
  };

  const mockLine = {
    id: 'line-1',
    description: 'Dienst',
    quantity: 1,
    unitPrice: 100,
    vatRate: 21,
    discountPct: 0,
    lineTotal: 100,
  };

  const quoteWithIncludes = (overrides: Record<string, unknown> = {}) => ({
    ...baseQuote,
    contact: { id: 'contact-1', companyName: 'Acme B.V.' },
    location: null,
    request: null,
    template: null,
    createdByUser: { id: 'user-1', firstName: 'Test', lastName: 'User', email: 'u@test.com' },
    lines: [mockLine],
    approvalRequests: [],
    ...overrides,
  });

  const mockTx = {
    quote: { update: jest.fn() },
    quoteApprovalRequest: { create: jest.fn(), update: jest.fn() },
  };

  const mockPrismaService = {
    quote: { findFirst: jest.fn(), update: jest.fn() },
    organization: { findUnique: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    quoteApprovalRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.user.findMany.mockResolvedValue([]);
    mockPrismaService.organization.findUnique.mockResolvedValue({
      quoteApprovalThreshold: 10000,
      quoteApprovalRequiredRole: Role.MANAGER,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteApprovalsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: { dispatch: jest.fn() } },
      ],
    }).compile();

    service = module.get<QuoteApprovalsService>(QuoteApprovalsService);
    notifications = module.get(NotificationsService);
  });

  // ─── submitForApproval (mandatory) ───────────────────────────────────

  describe('submitForApproval()', () => {
    it('creates a THRESHOLD request with the org required role and sets TER_GOEDKEURING', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ templateId: 'template-1', total: 20000 }),
      );
      mockTx.quoteApprovalRequest.create.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({ ...baseQuote, status: QuoteStatus.TER_GOEDKEURING });

      const result = await service.submitForApproval('quote-1', { note: 'Beoordeel' }, adminUser);

      expect(result.status).toBe(QuoteStatus.TER_GOEDKEURING);
      expect(mockTx.quoteApprovalRequest.create).toHaveBeenCalledWith({
        data: {
          quoteId: 'quote-1',
          requestedBy: 'user-1',
          kind: ApprovalKind.THRESHOLD,
          approverRole: Role.MANAGER,
          note: 'Beoordeel',
        },
      });
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.OFFERTE_TER_GOEDKEURING }),
      );
    });

    it('allows submit when below threshold but template requiresApproval', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        quoteApprovalThreshold: null,
        quoteApprovalRequiredRole: null,
      });
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ templateId: 'template-1', requiresApproval: true, total: 100 }),
      );
      mockTx.quoteApprovalRequest.create.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({ ...baseQuote, status: QuoteStatus.TER_GOEDKEURING });

      await service.submitForApproval('quote-1', {}, adminUser);

      // No configured role → approverRole null (fallback MANAGER/ORG_ADMIN at notify/approve)
      expect(mockTx.quoteApprovalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: ApprovalKind.THRESHOLD, approverRole: null }),
      });
    });

    it('throws when approval is not required (below threshold, no requiresApproval)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ templateId: 'template-1', total: 100 }),
      );

      await expect(service.submitForApproval('quote-1', {}, adminUser)).rejects.toThrow(
        'Deze offerte vereist geen goedkeuring',
      );
      expect(mockTx.quote.update).not.toHaveBeenCalled();
    });

    it('blocks submit of a quote without lines (B-315, NL-melding)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ templateId: 'template-1', requiresApproval: true, lines: [] }),
      );
      await expect(service.submitForApproval('quote-1', {}, adminUser)).rejects.toThrow(
        'Deze offerte heeft geen offerteregels',
      );
      expect(mockTx.quote.update).not.toHaveBeenCalled();
    });

    it('blocks submit without a linked template (REQ26 guard)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ requiresApproval: true }),
      );
      await expect(service.submitForApproval('quote-1', {}, adminUser)).rejects.toThrow(
        'Koppel eerst een offertesjabloon',
      );
    });
  });

  // ─── approve / reject (mandatory, role-enforced) ─────────────────────

  describe('approve()', () => {
    // Aangevraagd door user-1 (admin) — manager-1 is dus een ándere goedkeurder.
    const pending = {
      id: 'approval-1',
      quoteId: 'quote-1',
      kind: ApprovalKind.THRESHOLD,
      approverRole: Role.MANAGER,
      approverUserId: null,
      requestedBy: 'user-1',
      status: ApprovalStatus.PENDING,
      note: null,
    };

    it('approves and sets GOEDGEKEURD when approver has the required role', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue(pending);
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({ ...baseQuote, status: QuoteStatus.GOEDGEKEURD });

      const result = await service.approve('quote-1', {}, managerUser);

      expect(result.status).toBe(QuoteStatus.GOEDGEKEURD);
      expect(mockTx.quoteApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-1' },
        data: expect.objectContaining({ status: ApprovalStatus.APPROVED, reviewedBy: 'manager-1' }),
      });
    });

    it('rejects approval by a user lacking the required role', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue(pending);

      await expect(service.approve('quote-1', {}, backofficeUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockTx.quote.update).not.toHaveBeenCalled();
    });

    // ─── Vier-ogen / self-approval (B-307) ─────────────────────────────

    it('forbids the requester from approving their own request (B-307, NL-melding)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue({
        ...pending,
        requestedBy: 'manager-1', // dezelfde manager die nu goedkeurt
      });

      await expect(service.approve('quote-1', {}, managerUser)).rejects.toThrow(
        'U kunt uw eigen goedkeuringsverzoek niet zelf afhandelen',
      );
      expect(mockTx.quote.update).not.toHaveBeenCalled();
    });

    it('allows self-approval when the org explicitly enables it', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        quoteApprovalThreshold: 10000,
        quoteApprovalRequiredRole: Role.MANAGER,
        quoteApprovalSelfApprovalAllowed: true,
      });
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue({
        ...pending,
        requestedBy: 'manager-1',
      });
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({ ...baseQuote, status: QuoteStatus.GOEDGEKEURD });

      const result = await service.approve('quote-1', {}, managerUser);

      expect(result.status).toBe(QuoteStatus.GOEDGEKEURD);
    });

    it('still lets a different approver with the required role approve (four-eyes happy path)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue(pending); // requestedBy user-1
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({ ...baseQuote, status: QuoteStatus.GOEDGEKEURD });

      const result = await service.approve('quote-1', {}, managerUser);

      expect(result.status).toBe(QuoteStatus.GOEDGEKEURD);
      // Geen org-lookup nodig op het happy path (self-check niet getriggerd).
    });
  });

  describe('reject()', () => {
    it('sets CONCEPT back and records rejection (with required role)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue({
        id: 'approval-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.THRESHOLD,
        approverRole: Role.MANAGER,
        approverUserId: null,
        status: ApprovalStatus.PENDING,
        note: null,
      });
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({ ...baseQuote, status: QuoteStatus.CONCEPT });

      const result = await service.reject('quote-1', { note: 'Prijs te hoog' }, managerUser);

      expect(result.status).toBe(QuoteStatus.CONCEPT);
      expect(mockTx.quoteApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-1' },
        data: expect.objectContaining({ status: ApprovalStatus.REJECTED, note: 'Prijs te hoog' }),
      });
    });

    it('accepts a rejection without a note (B-314: note is optioneel)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue({
        id: 'approval-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.THRESHOLD,
        approverRole: Role.MANAGER,
        approverUserId: null,
        requestedBy: 'user-1',
        status: ApprovalStatus.PENDING,
        note: null,
      });
      mockTx.quoteApprovalRequest.update.mockResolvedValue({});
      mockTx.quote.update.mockResolvedValue({ ...baseQuote, status: QuoteStatus.CONCEPT });

      const result = await service.reject('quote-1', {}, managerUser);

      expect(result.status).toBe(QuoteStatus.CONCEPT);
    });

    it('forbids the requester from rejecting their own request (B-307)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(
        quoteWithIncludes({ status: QuoteStatus.TER_GOEDKEURING }),
      );
      mockPrismaService.quoteApprovalRequest.findFirst.mockResolvedValue({
        id: 'approval-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.THRESHOLD,
        approverRole: Role.MANAGER,
        approverUserId: null,
        requestedBy: 'manager-1', // zelfde als de afhandelaar
        status: ApprovalStatus.PENDING,
        note: null,
      });

      await expect(service.reject('quote-1', { note: 'x' }, managerUser)).rejects.toThrow(
        'U kunt uw eigen goedkeuringsverzoek niet zelf afhandelen',
      );
      expect(mockTx.quote.update).not.toHaveBeenCalled();
    });
  });

  // ─── Voluntary team ──────────────────────────────────────────────────

  describe('requestTeamApproval()', () => {
    it('creates a VOLUNTARY_TEAM request for the requester own (single) role, no status change', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.quoteApprovalRequest.create.mockResolvedValue({ id: 'req-1' });

      await service.requestTeamApproval('quote-1', {}, backofficeUser);

      expect(mockPrismaService.quoteApprovalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: ApprovalKind.VOLUNTARY_TEAM,
          approverRole: Role.BACKOFFICE,
        }),
      });
      // never touches quote status
      expect(mockPrismaService.quote.update).not.toHaveBeenCalled();
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_TEAM }),
      );
    });

    it('requires an explicit role when the requester has multiple roles', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      const multi = makeUser([Role.MANAGER, Role.BACKOFFICE], 'multi-1');

      await expect(service.requestTeamApproval('quote-1', {}, multi)).rejects.toThrow(
        'Kies expliciet een team',
      );
    });

    it('rejects requesting approval from a team the requester is not part of', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());

      await expect(
        service.requestTeamApproval('quote-1', { role: Role.MANAGER }, backofficeUser),
      ).rejects.toThrow('eigen team');
    });
  });

  // ─── Voluntary person ────────────────────────────────────────────────

  describe('requestPersonApproval()', () => {
    it('creates a VOLUNTARY_PERSON request for an org-mate', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-1' }); // assertSameOrg
      mockPrismaService.quoteApprovalRequest.create.mockResolvedValue({ id: 'req-1' });

      await service.requestPersonApproval('quote-1', { approverUserId: 'manager-1' }, backofficeUser);

      expect(mockPrismaService.quoteApprovalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: ApprovalKind.VOLUNTARY_PERSON,
          approverUserId: 'manager-1',
        }),
      });
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_PERSOON }),
      );
    });

    it('rejects a person from another org (cross-tenant)', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.requestPersonApproval('quote-1', { approverUserId: 'foreign-1' }, backofficeUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.quoteApprovalRequest.create).not.toHaveBeenCalled();
    });

    it('rejects asking yourself', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());

      await expect(
        service.requestPersonApproval('quote-1', { approverUserId: 'backoffice-1' }, backofficeUser),
      ).rejects.toThrow('uzelf');
    });
  });

  // ─── Voluntary review / cancel ───────────────────────────────────────

  describe('reviewVoluntary()', () => {
    it('lets the targeted person approve without changing quote status', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.quoteApprovalRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.VOLUNTARY_PERSON,
        approverRole: null,
        approverUserId: 'manager-1',
        requestedBy: 'backoffice-1',
        status: ApprovalStatus.PENDING,
        note: null,
      });
      mockPrismaService.quoteApprovalRequest.update.mockResolvedValue({ id: 'req-1' });

      await service.reviewVoluntary('quote-1', 'req-1', true, {}, managerUser);

      expect(mockPrismaService.quoteApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({ status: ApprovalStatus.APPROVED }),
      });
      expect(mockPrismaService.quote.update).not.toHaveBeenCalled();
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.OFFERTE_GOEDKEURING_AFGEHANDELD }),
      );
    });

    it('forbids a non-targeted user from reviewing a person request', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.quoteApprovalRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.VOLUNTARY_PERSON,
        approverRole: null,
        approverUserId: 'manager-1',
        requestedBy: 'backoffice-1',
        status: ApprovalStatus.PENDING,
        note: null,
      });

      await expect(
        service.reviewVoluntary('quote-1', 'req-1', true, {}, backofficeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to review a mandatory (THRESHOLD) request via the voluntary route', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.quoteApprovalRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.THRESHOLD,
        approverRole: Role.MANAGER,
        approverUserId: null,
        requestedBy: 'backoffice-1',
        status: ApprovalStatus.PENDING,
        note: null,
      });

      await expect(
        service.reviewVoluntary('quote-1', 'req-1', true, {}, managerUser),
      ).rejects.toThrow('Verplichte goedkeuringsverzoeken');
    });
  });

  describe('cancelVoluntary()', () => {
    it('lets the requester cancel a pending voluntary request', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.quoteApprovalRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.VOLUNTARY_TEAM,
        approverRole: Role.BACKOFFICE,
        approverUserId: null,
        requestedBy: 'backoffice-1',
        status: ApprovalStatus.PENDING,
        note: null,
      });
      mockPrismaService.quoteApprovalRequest.update.mockResolvedValue({});

      await service.cancelVoluntary('quote-1', 'req-1', backofficeUser);

      expect(mockPrismaService.quoteApprovalRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: ApprovalStatus.CANCELLED },
      });
    });

    it('forbids cancelling someone else\'s request', async () => {
      mockPrismaService.quote.findFirst.mockResolvedValue(quoteWithIncludes());
      mockPrismaService.quoteApprovalRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        quoteId: 'quote-1',
        kind: ApprovalKind.VOLUNTARY_TEAM,
        approverRole: Role.BACKOFFICE,
        approverUserId: null,
        requestedBy: 'someone-else',
        status: ApprovalStatus.PENDING,
        note: null,
      });

      await expect(
        service.cancelVoluntary('quote-1', 'req-1', backofficeUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
