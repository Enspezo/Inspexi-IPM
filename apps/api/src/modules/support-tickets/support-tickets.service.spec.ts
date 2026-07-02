import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  Role,
  User,
  NotificationType,
  SupportMessageAuthorType,
  SupportTicketStatus,
} from '@prisma/client';
import { SupportTicketsService } from './support-tickets.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('SupportTicketsService', () => {
  let service: SupportTicketsService;

  const mockPrisma: any = {
    supportTicket: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    supportTicketMessage: { create: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const mockNotifications = { dispatch: jest.fn() };

  const superuser = {
    id: 'su',
    roles: [Role.SUPERUSER],
    orgId: null,
  } as unknown as User;
  const orgAdmin = {
    id: 'oa',
    roles: [Role.ORG_ADMIN],
    orgId: 'orgA',
  } as unknown as User;
  const manager = {
    id: 'mg',
    roles: [Role.MANAGER],
    orgId: 'orgA',
  } as unknown as User;
  const inspecteur = {
    id: 'insp',
    roles: [Role.INSPECTEUR],
    orgId: 'orgA',
  } as unknown as User;

  beforeEach(async () => {
    jest.clearAllMocks();
    // $transaction ondersteunt zowel de callback- (create) als de array-vorm (addMessage).
    mockPrisma.$transaction.mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportTicketsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<SupportTicketsService>(SupportTicketsService);
  });

  // ── Nummering ──────────────────────────────────────────────────────────────
  describe('create — nummering', () => {
    it('zet ticketNumber op max+1 binnen de org', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue({ ticketNumber: 7 });
      mockPrisma.supportTicket.create.mockResolvedValue({
        id: 't1',
        ticketNumber: 8,
        subject: 'X',
      });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.create(orgAdmin, { subject: 'X', description: 'iets' });

      const createArg = mockPrisma.supportTicket.create.mock.calls[0][0];
      expect(createArg.data.ticketNumber).toBe(8);
      expect(createArg.data.orgId).toBe('orgA');
      expect(createArg.data.createdById).toBe('oa');
      // Eerste bericht is een USER-bericht met de omschrijving als body.
      expect(createArg.data.messages.create[0]).toMatchObject({
        authorType: SupportMessageAuthorType.USER,
        body: 'iets',
      });
    });

    it('begint bij 1 als er nog geen tickets zijn', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue(null);
      mockPrisma.supportTicket.create.mockResolvedValue({ id: 't1', ticketNumber: 1 });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.create(orgAdmin, { subject: 'X', description: 'iets' });

      expect(mockPrisma.supportTicket.create.mock.calls[0][0].data.ticketNumber).toBe(1);
    });

    it('weigert aanmaken zonder organisatie (superuser)', async () => {
      await expect(
        service.create(superuser, { subject: 'X', description: 'iets' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('notificeert alle superusers behalve de actor', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue(null);
      mockPrisma.supportTicket.create.mockResolvedValue({
        id: 't1',
        ticketNumber: 1,
        subject: 'X',
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'su1' }, { id: 'su2' }]);

      await service.create(orgAdmin, { subject: 'X', description: 'iets' });

      expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
      const arg = mockNotifications.dispatch.mock.calls[0][0];
      expect(arg.type).toBe(NotificationType.SUPPORT_TICKET_AANGEMAAKT);
      expect(arg.recipientUserIds).toEqual(['su1', 'su2']);
      expect(arg.entityType).toBe('SupportTicket');
    });
  });

  // ── Zichtbaarheid ────────────────────────────────────────────────────────────
  describe('findAll — zichtbaarheid', () => {
    beforeEach(() => {
      mockPrisma.supportTicket.findMany.mockResolvedValue([]);
      mockPrisma.supportTicket.count.mockResolvedValue(0);
    });

    it('superuser krijgt de wachtrij over alle orgs (geen org/creator-filter)', async () => {
      await service.findAll(superuser, {});
      const where = mockPrisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.orgId).toBeUndefined();
      expect(where.createdById).toBeUndefined();
      expect(where.isDeleted).toBe(false);
    });

    it('niet-management ziet alleen eigen tickets, ook bij scope=org', async () => {
      await service.findAll(inspecteur, { scope: 'org' });
      const where = mockPrisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.orgId).toBe('orgA');
      expect(where.createdById).toBe('insp');
    });

    it('management bij scope=org ziet alle org-tickets (geen creator-filter)', async () => {
      await service.findAll(manager, { scope: 'org' });
      const where = mockPrisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.orgId).toBe('orgA');
      expect(where.createdById).toBeUndefined();
    });

    it('management bij scope=mine ziet alleen eigen tickets', async () => {
      await service.findAll(manager, { scope: 'mine' });
      const where = mockPrisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.createdById).toBe('mg');
    });

    it('superuser met orgId filtert de wachtrij op die organisatie', async () => {
      await service.findAll(superuser, { orgId: 'orgB' });
      const where = mockPrisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.orgId).toBe('orgB');
      expect(where.createdById).toBeUndefined();
    });

    it('niet-superuser negeert orgId (geen cross-tenant lek)', async () => {
      await service.findAll(inspecteur, { orgId: 'orgB' });
      const where = mockPrisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.orgId).toBe('orgA');
      expect(where.createdById).toBe('insp');
    });

    it('management negeert orgId-param (blijft eigen org)', async () => {
      await service.findAll(manager, { scope: 'org', orgId: 'orgB' });
      const where = mockPrisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.orgId).toBe('orgA');
    });
  });

  describe('stats', () => {
    it('groepeert per status binnen de eigen scope', async () => {
      mockPrisma.supportTicket.groupBy.mockResolvedValue([
        { status: 'NIEUW', _count: { _all: 3 } },
        { status: 'OPGELOST', _count: { _all: 1 } },
      ]);
      const result = await service.stats(orgAdmin);
      expect(result).toEqual({ NIEUW: 3, OPGELOST: 1 });
    });
  });

  // ── Detail ─────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    const ticketWithInternal = {
      id: 't1',
      orgId: 'orgA',
      createdById: 'oa',
      messages: [
        { id: 'm1', isInternal: false },
        { id: 'm2', isInternal: true },
      ],
    };

    it('verbergt interne notities voor niet-support', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...ticketWithInternal });
      const result = await service.findOne(orgAdmin, 't1');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('m1');
    });

    it('toont interne notities aan support (superuser)', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...ticketWithInternal });
      const result = await service.findOne(superuser, 't1');
      expect(result.messages).toHaveLength(2);
    });

    it('weigert toegang tot een ticket van een andere org (403)', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({
        id: 't1',
        orgId: 'orgB',
        createdById: 'someone',
        messages: [],
      });
      await expect(service.findOne(orgAdmin, 't1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('weigert een niet-management gebruiker een ticket van een collega (403)', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({
        id: 't1',
        orgId: 'orgA',
        createdById: 'andere-collega',
        messages: [],
      });
      await expect(service.findOne(inspecteur, 't1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ── Reactie / status-overgangen ──────────────────────────────────────────────
  describe('addMessage', () => {
    it('zet status terug naar IN_BEHANDELING als de klant reageert op WACHT_OP_KLANT', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({
        id: 't1',
        orgId: 'orgA',
        createdById: 'oa',
        assignedToId: null,
        firstResponseAt: new Date(),
        status: SupportTicketStatus.WACHT_OP_KLANT,
      });
      mockPrisma.supportTicketMessage.create.mockResolvedValue({ id: 'm1' });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'su1' }]);

      await service.addMessage(orgAdmin, 't1', { body: 'reactie' });

      const updateArg = mockPrisma.supportTicket.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe(SupportTicketStatus.IN_BEHANDELING);
      const msgArg = mockPrisma.supportTicketMessage.create.mock.calls[0][0];
      expect(msgArg.data.authorType).toBe(SupportMessageAuthorType.USER);
    });

    it('support-reactie zet firstResponseAt en notificeert de aanmaker', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({
        id: 't1',
        orgId: 'orgA',
        createdById: 'oa',
        assignedToId: null,
        firstResponseAt: null,
        status: SupportTicketStatus.NIEUW,
        ticketNumber: 5,
        subject: 'X',
      });
      mockPrisma.supportTicketMessage.create.mockResolvedValue({ id: 'm1' });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });

      await service.addMessage(superuser, 't1', { body: 'hallo' });

      const updateArg = mockPrisma.supportTicket.update.mock.calls[0][0];
      expect(updateArg.data.firstResponseAt).toBeInstanceOf(Date);
      expect(mockPrisma.supportTicketMessage.create.mock.calls[0][0].data.authorType).toBe(
        SupportMessageAuthorType.SUPPORT,
      );
      const dispatchArg = mockNotifications.dispatch.mock.calls[0][0];
      expect(dispatchArg.type).toBe(NotificationType.SUPPORT_TICKET_REACTIE);
      expect(dispatchArg.recipientUserIds).toEqual(['oa']);
    });

    it('weigert een interne notitie van een niet-support gebruiker (403)', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({
        id: 't1',
        orgId: 'orgA',
        createdById: 'oa',
        status: SupportTicketStatus.NIEUW,
      });
      await expect(
        service.addMessage(orgAdmin, 't1', { body: 'x', isInternal: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('stuurt geen notificatie bij een interne notitie', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({
        id: 't1',
        orgId: 'orgA',
        createdById: 'oa',
        assignedToId: null,
        firstResponseAt: new Date(),
        status: SupportTicketStatus.IN_BEHANDELING,
        ticketNumber: 5,
        subject: 'X',
      });
      mockPrisma.supportTicketMessage.create.mockResolvedValue({ id: 'm1' });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });

      await service.addMessage(superuser, 't1', { body: 'intern', isInternal: true });

      expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    });
  });

  // ── Muteren / rol-enforcement ─────────────────────────────────────────────────
  describe('update', () => {
    const baseTicket = {
      id: 't1',
      orgId: 'orgA',
      createdById: 'klant', // aanmaker ≠ actor, zodat de actor-exclusie de dispatch niet wegfiltert
      status: SupportTicketStatus.NIEUW,
      ticketNumber: 5,
    };

    it('weigert muteren door een MANAGER (alleen inzien)', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...baseTicket });
      await expect(
        service.update(manager, 't1', { status: SupportTicketStatus.OPGELOST }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('weigert ORG_ADMIN van een andere org', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({
        ...baseTicket,
        orgId: 'orgB',
      });
      await expect(
        service.update(orgAdmin, 't1', { status: SupportTicketStatus.OPGELOST }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ORG_ADMIN zet status OPGELOST + resolvedAt en notificeert de aanmaker', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...baseTicket });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });

      await service.update(orgAdmin, 't1', { status: SupportTicketStatus.OPGELOST });

      const updateArg = mockPrisma.supportTicket.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe(SupportTicketStatus.OPGELOST);
      expect(updateArg.data.resolvedAt).toBeInstanceOf(Date);
      const dispatchArg = mockNotifications.dispatch.mock.calls[0][0];
      expect(dispatchArg.type).toBe(NotificationType.SUPPORT_TICKET_STATUS);
      expect(dispatchArg.recipientUserIds).toEqual(['klant']);
    });

    it('zet closedAt bij status GESLOTEN', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...baseTicket });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });
      await service.update(superuser, 't1', { status: SupportTicketStatus.GESLOTEN });
      expect(mockPrisma.supportTicket.update.mock.calls[0][0].data.closedAt).toBeInstanceOf(
        Date,
      );
    });

    it('disconnect bij assignedToId = null', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...baseTicket });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });
      await service.update(orgAdmin, 't1', { assignedToId: null });
      expect(mockPrisma.supportTicket.update.mock.calls[0][0].data.assignedTo).toEqual({
        disconnect: true,
      });
    });

    it('weigert een cross-tenant assignee (403)', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...baseTicket });
      // assertSameOrg leest user.orgId van de assignee → andere org.
      mockPrisma.user.findUnique.mockResolvedValue({ orgId: 'orgB' });
      await expect(
        service.update(orgAdmin, 't1', { assignedToId: 'foreign-user' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('staat een same-org assignee toe', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...baseTicket });
      mockPrisma.user.findUnique.mockResolvedValue({ orgId: 'orgA' });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });
      await service.update(orgAdmin, 't1', { assignedToId: 'eigen-user' });
      expect(mockPrisma.supportTicket.update.mock.calls[0][0].data.assignedTo).toEqual({
        connect: { id: 'eigen-user' },
      });
    });

    it('stuurt geen status-notificatie als de status niet wijzigt', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ ...baseTicket });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 't1' });
      await service.update(orgAdmin, 't1', { priority: 'HOOG' });
      expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    });
  });
});
