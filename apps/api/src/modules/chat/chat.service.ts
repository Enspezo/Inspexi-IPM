import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatThreadType,
  ChatThreadStatus,
  NotificationType,
  Prisma,
  Role,
  User,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertAllSameOrg, assertSameOrg, requireOrg } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import { ListMessagesQueryDto, SendMessageDto } from './dto';
import {
  isUniqueViolation,
  MESSAGE_SENDER,
  REFERENCE_TYPES,
  ReferenceType,
  resolveReferenceNames,
  teamRolesOf,
  toMessage,
  toSummary,
  USER_SUMMARY,
} from './chat.helpers';

/**
 * Kern van de chat-module: gedeelde org-scoped checks (chat-enablement,
 * referentie-validatie, thread-toegang/membership), de read-state-queries en de
 * primaire read/write van berichten (met notificatie-dispatch). De sub-services
 * (`ChatThreadsService`, `ChatSyncService`, `ChatTranscriptsService`) injecteren
 * deze service voor die gedeelde bouwstenen — nooit andersom.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Enablement & shared checks
  // ─────────────────────────────────────────────────────────────────────────

  /** Interne chat aan/uit per organisatie (REQ1 — schakelbaar door SUPERUSER/ORG_ADMIN). */
  async isChatEnabled(orgId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { chatEnabled: true },
    });
    return org?.chatEnabled ?? false;
  }

  async assertChatEnabled(orgId: string): Promise<void> {
    if (!(await this.isChatEnabled(orgId))) {
      throw new ForbiddenException('Chat is uitgeschakeld voor deze organisatie');
    }
  }

  /** Werkt `lastSeenAt` bij zonder de audit-middleware te triggeren (User is geaudit). */
  touchLastSeen(userId: string): void {
    this.prisma
      .$executeRaw`UPDATE imp_users SET last_seen_at = now() WHERE id = ${userId}::uuid`.catch(
      (err) => this.logger.warn(`touchLastSeen faalde: ${err?.message ?? err}`),
    );
  }

  /**
   * Valideert een record-referentie: het type moet bekend zijn en het record moet
   * tot de organisatie van de gebruiker behoren (cross-tenant isolatie). Beide
   * velden moeten samen gezet zijn of beide leeg.
   */
  async assertReferenceInOrg(
    type: string | null | undefined,
    id: string | null | undefined,
    orgId: string | null,
  ): Promise<void> {
    if (!type && !id) return;
    if (!type || !id) {
      throw new BadRequestException(
        'referenceEntityType en referenceEntityId moeten samen worden opgegeven',
      );
    }
    if (!REFERENCE_TYPES.includes(type as ReferenceType)) {
      throw new BadRequestException(`Onbekend referentietype: ${type}`);
    }
    const t = type as ReferenceType;
    switch (t) {
      case 'Contact':
        return assertSameOrg(this.prisma.contact, id, orgId, 'Relatie');
      case 'ContactPerson':
        return assertSameOrg(this.prisma.contactPerson, id, orgId, 'Contactpersoon');
      case 'Location':
        return assertSameOrg(this.prisma.location, id, orgId, 'Locatie');
      case 'Request':
        return assertSameOrg(this.prisma.request, id, orgId, 'Aanvraag');
      case 'Quote':
        return assertSameOrg(this.prisma.quote, id, orgId, 'Offerte');
      case 'Task':
        return assertSameOrg(this.prisma.task, id, orgId, 'Taak');
      case 'Document':
        return assertSameOrg(this.prisma.document, id, orgId, 'Document');
      case 'Product':
        return assertSameOrg(this.prisma.product, id, orgId, 'Product');
      case 'PlanningItem':
        return assertSameOrg(this.prisma.planningItem, id, orgId, 'Planning');
      case 'Project':
        return assertSameOrg(this.prisma.project, id, orgId, 'Project');
      case 'WorkOrder':
        return assertSameOrg(this.prisma.workOrder, id, orgId, 'Werkbon');
      case 'InspectionPlan':
        return assertSameOrg(this.prisma.inspectionPlan, id, orgId, 'Inspectie');
      case 'User':
        return assertSameOrg(this.prisma.user, id, orgId, 'Gebruiker');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Thread-toegang & membership
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Laadt een thread waar de gebruiker toegang toe heeft (deelnemer bij DIRECT,
   * rollid bij TEAM, altijd binnen dezelfde org). Geeft 404 bij geen toegang —
   * we onthullen niet of een thread van een andere org/team bestaat.
   */
  async loadAccessibleThread(threadId: string, user: User) {
    const orgId = requireOrg(user);
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, orgId, deletedAt: null },
    });
    if (!thread) throw new NotFoundException('Gesprek niet gevonden');
    await this.assertThreadMembership(thread, user);
    return thread;
  }

  /**
   * Membership-check op een reeds (org-scoped) geladen thread: deelnemer bij
   * DIRECT, rollid bij TEAM. Geeft 404 i.p.v. 403 zodat we niet onthullen of een
   * thread van een ander team/org bestaat.
   */
  async assertThreadMembership(
    thread: { id: string; type: ChatThreadType; teamRole: Role | null },
    user: User,
  ): Promise<void> {
    if (thread.type === ChatThreadType.DIRECT) {
      const part = await this.prisma.chatParticipant.findUnique({
        where: { threadId_userId: { threadId: thread.id, userId: user.id } },
        select: { id: true },
      });
      if (!part) throw new NotFoundException('Gesprek niet gevonden');
    } else if (!thread.teamRole || !user.roles.includes(thread.teamRole)) {
      throw new NotFoundException('Gesprek niet gevonden');
    }
  }

  /** Zorgt dat de team-threads + (caught-up) deelnemer-rij van de gebruiker bestaan. */
  async ensureMyThreads(user: User, orgId: string): Promise<void> {
    const roles = teamRolesOf(user);
    if (roles.length === 0) return;

    const existing = await this.prisma.chatThread.findMany({
      where: { orgId, type: ChatThreadType.TEAM, teamRole: { in: roles } },
      select: { id: true, teamRole: true },
    });
    const have = new Set(existing.map((t) => t.teamRole));
    for (const role of roles) {
      if (have.has(role)) continue;
      try {
        const created = await this.prisma.chatThread.create({
          data: { orgId, type: ChatThreadType.TEAM, teamRole: role, createdById: user.id },
          select: { id: true, teamRole: true },
        });
        existing.push(created);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        const found = await this.prisma.chatThread.findFirst({
          where: { orgId, type: ChatThreadType.TEAM, teamRole: role },
          select: { id: true, teamRole: true },
        });
        if (found) existing.push(found);
      }
    }

    // Eigen deelnemer-rijen (read-state) aanmaken — caught-up zodat historie niet
    // als ongelezen binnenkomt.
    const teamThreadIds = existing.map((t) => t.id);
    const myParts = await this.prisma.chatParticipant.findMany({
      where: { userId: user.id, threadId: { in: teamThreadIds } },
      select: { threadId: true },
    });
    const haveParts = new Set(myParts.map((p) => p.threadId));
    for (const threadId of teamThreadIds) {
      if (haveParts.has(threadId)) continue;
      try {
        await this.prisma.chatParticipant.create({
          data: { threadId, userId: user.id, lastReadAt: new Date() },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
  }

  async myThreadIds(user: User, orgId: string): Promise<string[]> {
    const roles = teamRolesOf(user);
    const [directParts, teamThreads] = await Promise.all([
      this.prisma.chatParticipant.findMany({
        where: { userId: user.id, thread: { type: ChatThreadType.DIRECT, orgId, deletedAt: null } },
        select: { threadId: true },
      }),
      roles.length
        ? this.prisma.chatThread.findMany({
            where: { orgId, type: ChatThreadType.TEAM, teamRole: { in: roles }, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);
    return [...directParts.map((p) => p.threadId), ...teamThreads.map((t) => t.id)];
  }

  /** Ongelezen-aantal per thread (één query) op basis van de eigen `lastReadAt`. */
  async unreadByThread(userId: string, threadIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (threadIds.length === 0) return map;
    const rows = await this.prisma.$queryRaw<Array<{ threadId: string; unread: number }>>(Prisma.sql`
      SELECT m.thread_id::text AS "threadId", COUNT(*)::int AS unread
      FROM imp_chat_messages m
      LEFT JOIN imp_chat_participants p
        ON p.thread_id = m.thread_id AND p.user_id::text = ${userId}
      WHERE m.thread_id::text IN (${Prisma.join(threadIds)})
        AND m.deleted_at IS NULL
        AND m.sender_id::text <> ${userId}
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
      GROUP BY m.thread_id
    `);
    for (const r of rows) map.set(r.threadId, Number(r.unread));
    return map;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Thread read + messages (primaire read/write; hergebruikt door sub-services)
  // ─────────────────────────────────────────────────────────────────────────

  async getThread(threadId: string, user: User) {
    await this.assertChatEnabled(requireOrg(user));
    await this.loadAccessibleThread(threadId, user);
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, orgId: user.orgId!, deletedAt: null },
      include: {
        participants: { include: { user: { select: USER_SUMMARY } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: MESSAGE_SENDER } },
        },
      },
    });
    if (!thread) throw new NotFoundException('Gesprek niet gevonden');
    const unread = await this.unreadByThread(user.id, [threadId]);
    const refNames = await resolveReferenceNames(this.prisma, [thread]);
    return toSummary(thread, user, unread.get(threadId) ?? 0, refNames);
  }

  async listMessages(threadId: string, user: User, query: ListMessagesQueryDto) {
    await this.assertChatEnabled(requireOrg(user));
    await this.loadAccessibleThread(threadId, user);
    const where: Prisma.ChatMessageWhereInput = { threadId, deletedAt: null };
    if (query.since) where.createdAt = { gt: new Date(query.since) };

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: MESSAGE_SENDER } },
    });
    this.touchLastSeen(user.id);

    const refNames = await resolveReferenceNames(this.prisma, messages);
    return messages.map((m) => toMessage(m, refNames));
  }

  async sendMessage(
    threadId: string,
    user: User,
    dto: SendMessageDto,
    // Sync-only: laat de offline-PWA het client-id + device behouden. De REST-flow
    // geeft niets mee. Authorisatie/notificaties/read-state lopen identiek.
    opts?: { id?: string; deviceId?: string },
  ) {
    const orgId = requireOrg(user);
    await this.assertChatEnabled(orgId);
    const thread = await this.loadAccessibleThread(threadId, user);
    if (thread.status === ChatThreadStatus.AFGEROND) {
      throw new BadRequestException('Dit gesprek is afgerond en kan geen nieuwe berichten ontvangen');
    }
    await this.assertReferenceInOrg(dto.referenceEntityType, dto.referenceEntityId, orgId);

    const mentioned = [...new Set(dto.mentionedUserIds ?? [])];
    if (mentioned.length > 0) {
      await assertAllSameOrg(this.prisma.user, mentioned, orgId, 'Genoemde gebruikers');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        ...(opts?.id ? { id: opts.id } : {}),
        threadId,
        orgId,
        senderId: user.id,
        content: dto.content,
        mentionedUserIds: mentioned,
        referenceEntityType: dto.referenceEntityType ?? null,
        referenceEntityId: dto.referenceEntityId ?? null,
        deviceId: opts?.deviceId ?? null,
        syncedAt: opts ? new Date() : null,
      },
      include: { sender: { select: MESSAGE_SENDER } },
    });

    // Afzender heeft z'n eigen bericht "gelezen".
    await this.prisma.chatParticipant.upsert({
      where: { threadId_userId: { threadId, userId: user.id } },
      update: { lastReadAt: new Date() },
      create: { threadId, userId: user.id, lastReadAt: new Date() },
    });

    this.touchLastSeen(user.id);
    await this.dispatchMessageNotifications(thread, user, message.id, dto.content, mentioned);

    const refNames = await resolveReferenceNames(this.prisma, [message]);
    return toMessage(message, refNames);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Notificaties
  // ─────────────────────────────────────────────────────────────────────────

  /** Gebruikers die de thread mogen zien (DIRECT: deelnemers, TEAM: rolleden). */
  private async threadVisibleUserIds(thread: {
    id: string;
    orgId: string;
    type: ChatThreadType;
    teamRole: Role | null;
  }): Promise<string[]> {
    if (thread.type === ChatThreadType.DIRECT) {
      const parts = await this.prisma.chatParticipant.findMany({
        where: { threadId: thread.id },
        select: { userId: true },
      });
      return parts.map((p) => p.userId);
    }
    if (!thread.teamRole) return [];
    const members = await this.prisma.user.findMany({
      where: {
        orgId: thread.orgId,
        isDeleted: false,
        isActive: true,
        roles: { has: thread.teamRole },
      },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  /**
   * Filtert ontvangers die al een ongelezen notificatie van dit type voor deze
   * thread hebben — voorkomt dat 50 berichten 50 notificaties opleveren.
   */
  private async dropAlreadyNotified(
    userIds: string[],
    type: NotificationType,
    threadId: string,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const existing = await this.prisma.notification.findMany({
      where: {
        userId: { in: userIds },
        type,
        entityType: 'chatThread',
        entityId: threadId,
        isRead: false,
      },
      select: { userId: true },
    });
    const has = new Set(existing.map((n) => n.userId));
    return userIds.filter((id) => !has.has(id));
  }

  private async dispatchMessageNotifications(
    thread: { id: string; orgId: string; type: ChatThreadType; teamRole: Role | null },
    sender: User,
    messageId: string,
    content: string,
    mentioned: string[],
  ): Promise<void> {
    try {
      const visible = new Set(await this.threadVisibleUserIds(thread));
      visible.delete(sender.id);

      const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Iemand';
      const preview = content.length > 140 ? `${content.slice(0, 140)}…` : content;
      const teamLabel = thread.teamRole ? `team ${thread.teamRole}` : 'team';

      // Mentions: alleen naar gebruikers die de thread kunnen zien.
      const mentionTargets = await this.dropAlreadyNotified(
        mentioned.filter((id) => visible.has(id)),
        NotificationType.CHAT_MENTION,
        thread.id,
      );
      if (mentionTargets.length > 0) {
        this.notifications.dispatch({
          type: NotificationType.CHAT_MENTION,
          orgId: thread.orgId,
          recipientUserIds: mentionTargets,
          title: `${senderName} noemde u in een chat`,
          body: preview,
          entityType: 'chatThread',
          entityId: thread.id,
        });
      }

      // Nieuw-bericht: overige zichtbare deelnemers (mentions krijgen al een mention).
      const mentionSet = new Set(mentionTargets);
      const messageType =
        thread.type === ChatThreadType.TEAM
          ? NotificationType.CHAT_TEAM_BERICHT
          : NotificationType.CHAT_BERICHT;
      const messageTargets = await this.dropAlreadyNotified(
        [...visible].filter((id) => !mentionSet.has(id) && !mentioned.includes(id)),
        messageType,
        thread.id,
      );
      if (messageTargets.length > 0) {
        this.notifications.dispatch({
          type: messageType,
          orgId: thread.orgId,
          recipientUserIds: messageTargets,
          title:
            thread.type === ChatThreadType.TEAM
              ? `Nieuw bericht in ${teamLabel}`
              : `Nieuw bericht van ${senderName}`,
          body: preview,
          entityType: 'chatThread',
          entityId: thread.id,
        });
      }
    } catch (err) {
      this.logger.error(`Chat-notificatie dispatch faalde (msg ${messageId})`, err as Error);
    }
  }
}
