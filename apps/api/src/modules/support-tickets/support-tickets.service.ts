import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  Prisma,
  Role,
  User,
  NotificationType,
  SupportMessageAuthorType,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  paginate,
  assertFound,
  assertSameOrg,
  requireOrg,
  isSuperuser,
  isManagement,
  USER_SUMMARY_SELECT,
} from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateSupportTicketDto,
  AddTicketMessageDto,
  UpdateSupportTicketDto,
  ListSupportTicketsDto,
} from './dto';

/** Velden die altijd in detail/lijst worden meegestuurd. */
const ticketInclude = {
  createdBy: { select: USER_SUMMARY_SELECT },
  assignedTo: { select: USER_SUMMARY_SELECT },
  organization: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SupportTicketsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── Lijst ──────────────────────────────────────────────────────────────────
  async findAll(user: User, q: ListSupportTicketsDto) {
    const { scope, status, orgId, page = 1, limit = 20, sortOrder = 'desc' } = q;

    const where: Prisma.SupportTicketWhereInput = {
      isDeleted: false,
      ...(status ? { status } : {}),
    };

    if (isSuperuser(user)) {
      // SUPERUSER: support-wachtrij over alle organisaties; optioneel op één org filteren.
      if (orgId) where.orgId = orgId;
    } else {
      where.orgId = user.orgId!;
      // 'org' alleen voor management; anders (of bij 'mine') alleen eigen tickets.
      if (scope !== 'org' || !isManagement(user)) {
        where.createdById = user.id;
      }
    }

    return paginate(this.prisma.supportTicket, {
      where,
      include: ticketInclude,
      orderBy: { lastMessageAt: sortOrder === 'asc' ? 'asc' : 'desc' },
      page,
      limit,
    });
  }

  async stats(user: User): Promise<Record<string, number>> {
    const where: Prisma.SupportTicketWhereInput = { isDeleted: false };
    if (isSuperuser(user)) {
      // Platform-support-wachtrij: bewust géén tenant-scoping, net als findAll
      // hierboven (WP-B3/D2-uitzondering — dit is een mijn.*-console over alle
      // organisaties; de lijst en de tellers moeten hetzelfde universum tonen).
    } else {
      where.orgId = user.orgId!;
      if (!isManagement(user)) where.createdById = user.id;
    }

    const grouped = await this.prisma.supportTicket.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    return grouped.reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = g._count._all;
      return acc;
    }, {});
  }

  // ── Detail ─────────────────────────────────────────────────────────────────
  async findOne(user: User, id: string) {
    const ticket = assertFound(
      await this.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          ...ticketInclude,
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { author: { select: USER_SUMMARY_SELECT } },
          },
        },
      }),
      'Ticket',
    );
    this.assertCanView(user, ticket);
    // Interne notities verbergen voor niet-support (alleen superuser/support ziet ze).
    if (!isSuperuser(user)) {
      ticket.messages = ticket.messages.filter((m) => !m.isInternal);
    }
    return ticket;
  }

  private assertCanView(
    user: User,
    ticket: { orgId: string; createdById: string },
  ): void {
    if (isSuperuser(user)) return;
    if (ticket.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot dit ticket');
    }
    // Niet-management mag alleen eigen tickets inzien.
    if (!isManagement(user) && ticket.createdById !== user.id) {
      throw new ForbiddenException('Geen toegang tot dit ticket');
    }
  }

  // ── Aanmaken ───────────────────────────────────────────────────────────────
  async create(user: User, dto: CreateSupportTicketDto) {
    // Tickets worden altijd onder de eigen org aangemaakt; superuser zonder org kan niet.
    const orgId = requireOrg(user);

    const ticket = await this.createWithNumber(user, orgId, dto);

    // Notificeer support (alle superusers), behalve de actor zelf.
    const supportIds = (
      await this.prisma.user.findMany({
        where: { roles: { has: Role.SUPERUSER } },
        select: { id: true },
      })
    )
      .map((u) => u.id)
      .filter((rid) => rid !== user.id);

    if (supportIds.length) {
      this.notifications.dispatch({
        type: NotificationType.SUPPORT_TICKET_AANGEMAAKT,
        orgId,
        recipientUserIds: supportIds,
        title: 'Nieuw supportticket',
        body: `#${ticket.ticketNumber} — ${ticket.subject}`,
        entityType: 'SupportTicket',
        entityId: ticket.id,
      });
    }
    return ticket;
  }

  /**
   * Maakt het ticket met een per-org oplopend `ticketNumber` (max+1 in een
   * transactie). De DB-constraint `@@unique([orgId, ticketNumber])` vangt een
   * zeldzame race; bij een unieke-constraint-fout (P2002) proberen we het opnieuw
   * — elke poging is een verse transactie, zodat een afgebroken tx de retry niet
   * maskeert.
   */
  private async createWithNumber(
    user: User,
    orgId: string,
    dto: CreateSupportTicketDto,
  ) {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.supportTicket.findFirst({
            where: { orgId },
            orderBy: { ticketNumber: 'desc' },
            select: { ticketNumber: true },
          });
          return tx.supportTicket.create({
            data: {
              orgId,
              ticketNumber: (last?.ticketNumber ?? 0) + 1,
              subject: dto.subject,
              description: dto.description,
              category: dto.category ?? 'VRAAG',
              priority: dto.priority ?? 'NORMAAL',
              contextModule: dto.contextModule,
              contextUrl: dto.contextUrl,
              createdById: user.id,
              lastMessageAt: new Date(),
              messages: {
                create: [
                  {
                    orgId,
                    authorId: user.id,
                    authorType: SupportMessageAuthorType.USER,
                    body: dto.description,
                  },
                ],
              },
            },
            include: ticketInclude,
          });
        });
      } catch (err) {
        const isUniqueRace =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (isUniqueRace && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }
  }

  // ── Reactie ────────────────────────────────────────────────────────────────
  async addMessage(user: User, id: string, dto: AddTicketMessageDto) {
    const ticket = assertFound(
      await this.prisma.supportTicket.findUnique({ where: { id } }),
      'Ticket',
    );
    this.assertCanView(user, ticket);

    const isSupport = isSuperuser(user);
    if (dto.isInternal && !isSupport) {
      throw new ForbiddenException('Alleen support mag interne notities plaatsen');
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId: id,
          orgId: ticket.orgId,
          authorId: user.id,
          authorType: isSupport
            ? SupportMessageAuthorType.SUPPORT
            : SupportMessageAuthorType.USER,
          body: dto.body,
          isInternal: dto.isInternal ?? false,
        },
        include: { author: { select: USER_SUMMARY_SELECT } },
      }),
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          lastMessageAt: new Date(),
          // firstResponseAt = eerste klant-zichtbare support-reactie (interne
          // notities tellen niet mee als "eerste reactie").
          ...(isSupport && !dto.isInternal && !ticket.firstResponseAt
            ? { firstResponseAt: new Date() }
            : {}),
          // Klant reageert op 'wacht op klant' → terug naar 'in behandeling'.
          ...(!isSupport && ticket.status === SupportTicketStatus.WACHT_OP_KLANT
            ? { status: SupportTicketStatus.IN_BEHANDELING }
            : {}),
        },
      }),
    ]);

    // Interne notities triggeren geen notificatie naar de klant.
    if (!dto.isInternal) {
      const recipientIds = isSupport
        ? [ticket.createdById]
        : ticket.assignedToId
          ? [ticket.assignedToId]
          : (
              await this.prisma.user.findMany({
                where: { roles: { has: Role.SUPERUSER } },
                select: { id: true },
              })
            ).map((u) => u.id);
      const filtered = recipientIds.filter((rid) => rid && rid !== user.id);
      if (filtered.length) {
        this.notifications.dispatch({
          type: NotificationType.SUPPORT_TICKET_REACTIE,
          orgId: ticket.orgId,
          recipientUserIds: filtered,
          title: `Reactie op ticket #${ticket.ticketNumber}`,
          body: ticket.subject,
          entityType: 'SupportTicket',
          entityId: ticket.id,
        });
      }
    }
    return message;
  }

  // ── Status / prioriteit / toewijzing ────────────────────────────────────────
  async update(user: User, id: string, dto: UpdateSupportTicketDto) {
    const ticket = assertFound(
      await this.prisma.supportTicket.findUnique({ where: { id } }),
      'Ticket',
    );
    // Muteren mag alleen door SUPERUSER of ORG_ADMIN van de eigen org.
    // MANAGER mag inzien maar niet wijzigen.
    const canEdit =
      isSuperuser(user) ||
      (user.roles.includes(Role.ORG_ADMIN) && ticket.orgId === user.orgId);
    if (!canEdit) {
      throw new ForbiddenException('Geen rechten om dit ticket te wijzigen');
    }

    // Voorkom cross-tenant toewijzing: de assignee moet bij de eigen org horen
    // (no-op voor SUPERUSER → die mag over alle orgs toewijzen).
    await assertSameOrg(this.prisma.user, dto.assignedToId, user.orgId, 'Gebruiker');

    const data: Prisma.SupportTicketUpdateInput = {};
    if (dto.priority) data.priority = dto.priority;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === SupportTicketStatus.OPGELOST) data.resolvedAt = new Date();
      if (dto.status === SupportTicketStatus.GESLOTEN) data.closedAt = new Date();
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data,
      include: ticketInclude,
    });

    if (dto.status && dto.status !== ticket.status) {
      const recipientIds = [ticket.createdById].filter((rid) => rid !== user.id);
      if (recipientIds.length) {
        this.notifications.dispatch({
          type: NotificationType.SUPPORT_TICKET_STATUS,
          orgId: ticket.orgId,
          recipientUserIds: recipientIds,
          title: `Ticket #${ticket.ticketNumber} bijgewerkt`,
          body: `Status: ${dto.status}`,
          entityType: 'SupportTicket',
          entityId: ticket.id,
        });
      }
    }
    return updated;
  }
}
