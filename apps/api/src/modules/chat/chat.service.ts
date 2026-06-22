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
  NoteEntityType,
  NotificationType,
  Prisma,
  Role,
  User,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertAllSameOrg, assertSameOrg, orgScope, requireOrg } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import { NotesService } from '../notes/notes.service';
import {
  CreateThreadDto,
  ListMessagesQueryDto,
  SearchChatUsersQueryDto,
  SendMessageDto,
} from './dto';

/** Lichte gebruikersweergave incl. presence voor de chat-UI. */
const USER_SUMMARY = {
  id: true,
  firstName: true,
  lastName: true,
  initials: true,
  avatarUrl: true,
  availability: true,
  availabilityNote: true,
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

const MESSAGE_SENDER = {
  id: true,
  firstName: true,
  lastName: true,
  initials: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/**
 * Referentie-types die in een chat gekoppeld mogen worden (PascalCase modelnaam).
 * `note` geeft het NoteEntityType waarmee een transcript bij afronden wordt
 * opgeslagen — `null` betekent "wel koppelbaar, maar geen notitie bij afronden".
 */
const REFERENCE_TYPES = [
  'Contact',
  'ContactPerson',
  'Location',
  'Request',
  'Quote',
  'Task',
  'Document',
  'Product',
  'PlanningItem',
  'Project',
  'WorkOrder',
  'InspectionPlan',
  'User',
] as const;
type ReferenceType = (typeof REFERENCE_TYPES)[number];

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private notes: NotesService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private teamRolesOf(user: User): Role[] {
    // SUPERUSER is geen org-teamrol; chat is strikt org-gebonden.
    return user.roles.filter((r) => r !== Role.SUPERUSER);
  }

  private directKey(a: string, b: string): string {
    return [a, b].sort().join(':');
  }

  /** Werkt `lastSeenAt` bij zonder de audit-middleware te triggeren (User is geaudit). */
  private touchLastSeen(userId: string): void {
    this.prisma
      .$executeRaw`UPDATE imp_users SET last_seen_at = now() WHERE id = ${userId}::uuid`.catch(
      (err) => this.logger.warn(`touchLastSeen faalde: ${err?.message ?? err}`),
    );
  }

  private noteEntityTypeFor(type: string | null): NoteEntityType | null {
    switch (type) {
      case 'Contact':
        return NoteEntityType.CONTACT;
      case 'Request':
        return NoteEntityType.REQUEST;
      case 'Quote':
        return NoteEntityType.QUOTE;
      case 'PlanningItem':
        return NoteEntityType.PLANNING;
      case 'Project':
        return NoteEntityType.PROJECT;
      case 'User':
        return NoteEntityType.USER;
      case 'WorkOrder':
        return NoteEntityType.WORK_ORDER;
      default:
        return null;
    }
  }

  /**
   * Valideert een record-referentie: het type moet bekend zijn en het record moet
   * tot de organisatie van de gebruiker behoren (cross-tenant isolatie). Beide
   * velden moeten samen gezet zijn of beide leeg.
   */
  private async assertReferenceInOrg(
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

  /** Batch-resolve leesbare namen voor record-referenties (key = `${type}:${id}`). */
  private async resolveReferenceNames(
    refs: Array<{ referenceEntityType: string | null; referenceEntityId: string | null }>,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const byType = new Map<string, Set<string>>();
    for (const r of refs) {
      if (!r.referenceEntityType || !r.referenceEntityId) continue;
      if (!byType.has(r.referenceEntityType)) byType.set(r.referenceEntityType, new Set());
      byType.get(r.referenceEntityType)!.add(r.referenceEntityId);
    }
    const set = (type: string, id: string, name: string) => map.set(`${type}:${id}`, name);

    for (const [type, idSet] of byType) {
      const ids = [...idSet];
      switch (type) {
        case 'Contact': {
          const rows = await this.prisma.contact.findMany({
            where: { id: { in: ids } },
            select: { id: true, companyName: true, firstName: true, lastName: true },
          });
          for (const c of rows)
            set(type, c.id, c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—');
          break;
        }
        case 'ContactPerson': {
          const rows = await this.prisma.contactPerson.findMany({
            where: { id: { in: ids } },
            select: { id: true, firstName: true, lastName: true },
          });
          for (const c of rows) set(type, c.id, [c.firstName, c.lastName].filter(Boolean).join(' ') || '—');
          break;
        }
        case 'Location': {
          const rows = await this.prisma.location.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          });
          for (const l of rows) set(type, l.id, l.name || '—');
          break;
        }
        case 'Request': {
          const rows = await this.prisma.request.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true },
          });
          for (const r of rows) set(type, r.id, r.title);
          break;
        }
        case 'Quote': {
          const rows = await this.prisma.quote.findMany({
            where: { id: { in: ids } },
            select: { id: true, quoteNumber: true },
          });
          for (const q of rows) set(type, q.id, q.quoteNumber);
          break;
        }
        case 'Task': {
          const rows = await this.prisma.task.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true },
          });
          for (const t of rows) set(type, t.id, t.title);
          break;
        }
        case 'Project': {
          const rows = await this.prisma.project.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true, projectNumber: true },
          });
          for (const p of rows) set(type, p.id, `${p.projectNumber} — ${p.title}`);
          break;
        }
        case 'WorkOrder': {
          const rows = await this.prisma.workOrder.findMany({
            where: { id: { in: ids } },
            select: { id: true, workOrderNumber: true },
          });
          for (const w of rows) set(type, w.id, w.workOrderNumber);
          break;
        }
        case 'PlanningItem': {
          const rows = await this.prisma.planningItem.findMany({
            where: { id: { in: ids } },
            select: { id: true, productName: true },
          });
          for (const p of rows) set(type, p.id, p.productName);
          break;
        }
        case 'InspectionPlan': {
          const rows = await this.prisma.inspectionPlan.findMany({
            where: { id: { in: ids } },
            select: { id: true, projectName: true, referenceNumber: true },
          });
          for (const i of rows) set(type, i.id, i.projectName || i.referenceNumber || '—');
          break;
        }
        case 'User': {
          const rows = await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, firstName: true, lastName: true },
          });
          for (const u of rows) set(type, u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || '—');
          break;
        }
        default:
          break;
      }
    }
    return map;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Thread-toegang & membership
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Laadt een thread waar de gebruiker toegang toe heeft (deelnemer bij DIRECT,
   * rollid bij TEAM, altijd binnen dezelfde org). Geeft 404 bij geen toegang —
   * we onthullen niet of een thread van een andere org/team bestaat.
   */
  private async loadAccessibleThread(threadId: string, user: User) {
    const orgId = requireOrg(user);
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, orgId, deletedAt: null },
    });
    if (!thread) throw new NotFoundException('Gesprek niet gevonden');

    if (thread.type === ChatThreadType.DIRECT) {
      const part = await this.prisma.chatParticipant.findUnique({
        where: { threadId_userId: { threadId, userId: user.id } },
        select: { id: true },
      });
      if (!part) throw new NotFoundException('Gesprek niet gevonden');
    } else {
      if (!thread.teamRole || !user.roles.includes(thread.teamRole)) {
        throw new NotFoundException('Gesprek niet gevonden');
      }
    }
    return thread;
  }

  /** Zorgt dat de team-threads + (caught-up) deelnemer-rij van de gebruiker bestaan. */
  private async ensureMyThreads(user: User, orgId: string): Promise<void> {
    const roles = this.teamRolesOf(user);
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

  private async myThreadIds(user: User, orgId: string): Promise<string[]> {
    const roles = this.teamRolesOf(user);
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
  private async unreadByThread(userId: string, threadIds: string[]): Promise<Map<string, number>> {
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
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  async listThreads(user: User) {
    if (!user.orgId) return [];
    const orgId = user.orgId;
    await this.ensureMyThreads(user, orgId);
    const roles = this.teamRolesOf(user);

    const [directThreads, teamThreads] = await Promise.all([
      this.prisma.chatThread.findMany({
        where: {
          orgId,
          type: ChatThreadType.DIRECT,
          deletedAt: null,
          participants: { some: { userId: user.id } },
        },
        include: {
          participants: { include: { user: { select: USER_SUMMARY } } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: { select: MESSAGE_SENDER } },
          },
        },
      }),
      roles.length
        ? this.prisma.chatThread.findMany({
            where: { orgId, type: ChatThreadType.TEAM, teamRole: { in: roles }, deletedAt: null },
            include: {
              messages: {
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: { sender: { select: MESSAGE_SENDER } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const all = [...directThreads, ...teamThreads];
    const [unread, refNames] = await Promise.all([
      this.unreadByThread(user.id, all.map((t) => t.id)),
      this.resolveReferenceNames(all),
    ]);

    const summaries = all.map((t) =>
      this.toSummary(t, user, unread.get(t.id) ?? 0, refNames),
    );
    summaries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    return summaries;
  }

  async getThread(threadId: string, user: User) {
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
    const refNames = await this.resolveReferenceNames([thread]);
    return this.toSummary(thread, user, unread.get(threadId) ?? 0, refNames);
  }

  async createThread(user: User, dto: CreateThreadDto) {
    const orgId = requireOrg(user);
    await this.assertReferenceInOrg(dto.referenceEntityType, dto.referenceEntityId, orgId);

    if (dto.type === ChatThreadType.DIRECT) {
      return this.getOrCreateDirect(user, orgId, dto);
    }
    return this.getOrCreateTeam(user, orgId, dto);
  }

  private async getOrCreateDirect(user: User, orgId: string, dto: CreateThreadDto) {
    if (!dto.userId) throw new BadRequestException('userId is vereist voor een 1-op-1 chat');
    if (dto.userId === user.id) {
      throw new BadRequestException('U kunt geen chat met uzelf starten');
    }
    const other = await this.prisma.user.findFirst({
      where: { id: dto.userId, orgId, isDeleted: false },
      select: { id: true },
    });
    if (!other) throw new NotFoundException('Gebruiker niet gevonden');

    const directKey = this.directKey(user.id, dto.userId);
    let thread = await this.prisma.chatThread.findFirst({
      where: { orgId, directKey, deletedAt: null },
      select: { id: true, referenceEntityType: true },
    });

    if (!thread) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const t = await tx.chatThread.create({
            data: {
              orgId,
              type: ChatThreadType.DIRECT,
              directKey,
              subject: dto.subject ?? null,
              referenceEntityType: dto.referenceEntityType ?? null,
              referenceEntityId: dto.referenceEntityId ?? null,
              createdById: user.id,
            },
            select: { id: true, referenceEntityType: true },
          });
          await tx.chatParticipant.createMany({
            data: [
              { threadId: t.id, userId: user.id, lastReadAt: new Date() },
              { threadId: t.id, userId: dto.userId! },
            ],
          });
          return t;
        });
        thread = created;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        thread = await this.prisma.chatThread.findFirst({
          where: { orgId, directKey, deletedAt: null },
          select: { id: true, referenceEntityType: true },
        });
      }
    }
    if (!thread) throw new NotFoundException('Gesprek niet gevonden');

    // Koppel de referentie aan een bestaande thread alleen als die er nog geen heeft.
    if (dto.referenceEntityType && !thread.referenceEntityType) {
      await this.prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          referenceEntityType: dto.referenceEntityType,
          referenceEntityId: dto.referenceEntityId ?? null,
        },
      });
    }
    return this.getThread(thread.id, user);
  }

  private async getOrCreateTeam(user: User, orgId: string, dto: CreateThreadDto) {
    const role = dto.teamRole;
    if (!role) throw new BadRequestException('teamRole is vereist voor een team-chat');
    if (!user.roles.includes(role)) {
      throw new ForbiddenException('U hoort niet bij dit team');
    }

    let thread = await this.prisma.chatThread.findFirst({
      where: { orgId, type: ChatThreadType.TEAM, teamRole: role, deletedAt: null },
      select: { id: true, referenceEntityType: true },
    });
    if (!thread) {
      try {
        thread = await this.prisma.chatThread.create({
          data: {
            orgId,
            type: ChatThreadType.TEAM,
            teamRole: role,
            subject: dto.subject ?? null,
            referenceEntityType: dto.referenceEntityType ?? null,
            referenceEntityId: dto.referenceEntityId ?? null,
            createdById: user.id,
          },
          select: { id: true, referenceEntityType: true },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        thread = await this.prisma.chatThread.findFirst({
          where: { orgId, type: ChatThreadType.TEAM, teamRole: role, deletedAt: null },
          select: { id: true, referenceEntityType: true },
        });
      }
    }
    if (!thread) throw new NotFoundException('Gesprek niet gevonden');

    await this.prisma.chatParticipant
      .upsert({
        where: { threadId_userId: { threadId: thread.id, userId: user.id } },
        update: {},
        create: { threadId: thread.id, userId: user.id, lastReadAt: new Date() },
      })
      .catch((e) => {
        if (!isUniqueViolation(e)) throw e;
      });

    if (dto.referenceEntityType && !thread.referenceEntityType) {
      await this.prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          referenceEntityType: dto.referenceEntityType,
          referenceEntityId: dto.referenceEntityId ?? null,
        },
      });
    }
    return this.getThread(thread.id, user);
  }

  async listMessages(threadId: string, user: User, query: ListMessagesQueryDto) {
    await this.loadAccessibleThread(threadId, user);
    const where: Prisma.ChatMessageWhereInput = { threadId, deletedAt: null };
    if (query.since) where.createdAt = { gt: new Date(query.since) };

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: MESSAGE_SENDER } },
    });
    this.touchLastSeen(user.id);

    const refNames = await this.resolveReferenceNames(messages);
    return messages.map((m) => this.toMessage(m, refNames));
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

    const refNames = await this.resolveReferenceNames([message]);
    return this.toMessage(message, refNames);
  }

  async markRead(threadId: string, user: User) {
    await this.loadAccessibleThread(threadId, user);
    await this.prisma.chatParticipant.upsert({
      where: { threadId_userId: { threadId, userId: user.id } },
      update: { lastReadAt: new Date() },
      create: { threadId, userId: user.id, lastReadAt: new Date() },
    });
    // Markeer ook de bijbehorende chat-notificaties gelezen — anders houdt de
    // dedup (dropAlreadyNotified) verdere meldingen tegen nadat je een thread al
    // eens hebt geopend, en blijft de notificatie-bel onnodig tellen.
    await this.prisma.notification.updateMany({
      where: { userId: user.id, entityType: 'chatThread', entityId: threadId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    this.touchLastSeen(user.id);
    return { success: true };
  }

  async getUnread(user: User) {
    if (!user.orgId) return { count: 0 };
    await this.ensureMyThreads(user, user.orgId);
    this.touchLastSeen(user.id);
    const ids = await this.myThreadIds(user, user.orgId);
    const unread = await this.unreadByThread(user.id, ids);
    let count = 0;
    for (const n of unread.values()) count += n;
    return { count };
  }

  async closeThread(threadId: string, user: User) {
    const thread = await this.loadAccessibleThread(threadId, user);
    if (thread.status === ChatThreadStatus.AFGEROND) {
      return this.getThread(threadId, user);
    }

    let noteId: string | null = thread.noteId ?? null;
    const noteType = this.noteEntityTypeFor(thread.referenceEntityType);
    if (noteType && thread.referenceEntityId) {
      try {
        const transcript = await this.buildTranscript(threadId);
        const note = await this.notes.create(
          {
            entityType: noteType,
            entityId: thread.referenceEntityId,
            content: transcript,
          },
          user,
        );
        noteId = note.id;
      } catch (err) {
        // Een mislukte notitie mag het afronden niet blokkeren.
        this.logger.error(`Transcript-notitie aanmaken faalde voor thread ${threadId}`, err as Error);
      }
    }

    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { status: ChatThreadStatus.AFGEROND, closedAt: new Date(), noteId },
    });
    return this.getThread(threadId, user);
  }

  async searchUsers(user: User, query: SearchChatUsersQueryDto) {
    if (!user.orgId) return [];
    const q = (query.q ?? '').trim();
    const where: Prisma.UserWhereInput = {
      orgId: user.orgId,
      isDeleted: false,
      isActive: true,
      id: { not: user.id },
    };
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      select: { ...USER_SUMMARY, roles: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 20,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sync (PWA-brug) — additieve /sync v2-uitbreiding (REQ1 PR2)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Snapshot van zichtbare chat voor de offline-PWA: alleen threads waar de
   * gebruiker deelnemer (DIRECT) of rollid (TEAM) van is — dezelfde autorisatie
   * als de REST-endpoints. Inclusief tombstones (deletedAt) en presence.
   */
  async getSyncSnapshot(user: User, since: Date) {
    const empty = {
      chatThreads: [] as unknown[],
      chatMessages: [] as unknown[],
      deletedThreadIds: [] as string[],
      deletedMessageIds: [] as string[],
      users: [] as unknown[],
    };
    if (!user.orgId) return empty;
    const orgId = user.orgId;
    // Pull is read-only: DIRECT-zichtbaarheid via bestaande participant-rijen,
    // TEAM via rol-membership. Team-threads worden in de portal geprovisioneerd
    // (ensureMyThreads), niet hier — een /sync/pull mag geen rijen schrijven.
    const roles = this.teamRolesOf(user);

    const [directParts, teamThreads] = await Promise.all([
      this.prisma.chatParticipant.findMany({
        where: { userId: user.id, thread: { type: ChatThreadType.DIRECT, orgId } },
        select: { threadId: true },
      }),
      roles.length
        ? this.prisma.chatThread.findMany({
            where: { orgId, type: ChatThreadType.TEAM, teamRole: { in: roles } },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);
    const visibleIds = [
      ...new Set([...directParts.map((p) => p.threadId), ...teamThreads.map((t) => t.id)]),
    ];

    const users = await this.presenceUsers(orgId, user.id, since);
    if (visibleIds.length === 0) return { ...empty, users };

    const [threads, delThreads, messages, delMessages] = await Promise.all([
      this.prisma.chatThread.findMany({
        where: {
          id: { in: visibleIds },
          deletedAt: null,
          OR: [{ createdAt: { gt: since } }, { updatedAt: { gt: since } }],
        },
      }),
      this.prisma.chatThread.findMany({
        where: { id: { in: visibleIds }, deletedAt: { gt: since } },
        select: { id: true },
      }),
      this.prisma.chatMessage.findMany({
        where: {
          threadId: { in: visibleIds },
          deletedAt: null,
          OR: [{ createdAt: { gt: since } }, { updatedAt: { gt: since } }],
        },
      }),
      this.prisma.chatMessage.findMany({
        where: { threadId: { in: visibleIds }, deletedAt: { gt: since } },
        select: { id: true },
      }),
    ]);

    return {
      chatThreads: threads.map((t) => ({
        id: t.id,
        type: t.type,
        teamRole: t.teamRole,
        subject: t.subject,
        status: t.status,
        referenceEntityType: t.referenceEntityType,
        referenceEntityId: t.referenceEntityId,
        createdById: t.createdById,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      chatMessages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        senderId: m.senderId,
        content: m.content,
        mentionedUserIds: m.mentionedUserIds,
        referenceEntityType: m.referenceEntityType,
        referenceEntityId: m.referenceEntityId,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      deletedThreadIds: delThreads.map((t) => t.id),
      deletedMessageIds: delMessages.map((m) => m.id),
      users,
    };
  }

  /**
   * Presence-delta: alleen gebruikers wier presence sinds `since` veranderde
   * (presence-wijzigingen zetten altijd `lastSeenAt`, ook bij een statuswissel —
   * zie updatePresence/touchLastSeen), plus altijd de aanvrager zelf zodat de PWA
   * de eigen status kent. Houdt de payload klein op frequente polls.
   */
  private async presenceUsers(orgId: string, selfId: string, since: Date) {
    return this.prisma.user.findMany({
      where: {
        orgId,
        isDeleted: false,
        OR: [{ id: selfId }, { lastSeenAt: { gt: since } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        initials: true,
        availability: true,
        availabilityNote: true,
        lastSeenAt: true,
      },
    });
  }

  /**
   * Past een via /sync gepushte chat-bericht-wijziging toe. Berichten lopen
   * bewust NIET via de generieke sync-mutator: ze vereisen membership-autorisatie
   * + notificatie-dispatch, dus delegeren we naar `sendMessage` (idempotent op
   * client-id, zodat replay veilig is).
   */
  async applySyncMessage(
    user: User,
    operation: 'create' | 'update' | 'delete',
    data: Record<string, unknown>,
  ): Promise<{ id: string; status: 'success' }> {
    const id = data.id ? String(data.id) : undefined;

    if (operation === 'delete') {
      if (!id) throw new BadRequestException('Bericht-id ontbreekt');
      const existing = await this.prisma.chatMessage.findFirst({
        where: { id, senderId: user.id, ...orgScope(user) },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Bericht niet gevonden');
      await this.prisma.chatMessage.update({ where: { id }, data: { deletedAt: new Date() } });
      return { id, status: 'success' };
    }

    // Berichten zijn immutable: alleen create (verzenden) en delete via sync.
    if (operation === 'update') {
      throw new BadRequestException('Bewerken van chatberichten wordt niet ondersteund');
    }

    // create → send. Idempotent (replay-veilig): een al bestaand eigen client-id
    // is al gesynct. Org/sender-scoped zodat een (astronomisch onwaarschijnlijke)
    // id-botsing met een ander bericht niet stilletjes wordt geslikt.
    if (id) {
      const existing = await this.prisma.chatMessage.findFirst({
        where: { id, senderId: user.id, ...orgScope(user) },
        select: { id: true },
      });
      if (existing) return { id, status: 'success' };
    }

    const threadId = data.threadId ? String(data.threadId) : '';
    if (!threadId) throw new BadRequestException('threadId ontbreekt');
    const mentioned = Array.isArray(data.mentionedUserIds)
      ? (data.mentionedUserIds as unknown[]).map(String)
      : undefined;

    const msg = await this.sendMessage(
      threadId,
      user,
      {
        content: String(data.content ?? ''),
        mentionedUserIds: mentioned,
        referenceEntityType: data.referenceEntityType ? String(data.referenceEntityType) : undefined,
        referenceEntityId: data.referenceEntityId ? String(data.referenceEntityId) : undefined,
      },
      { id, deviceId: data.deviceId ? String(data.deviceId) : undefined },
    );
    return { id: msg.id, status: 'success' };
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

  // ─────────────────────────────────────────────────────────────────────────
  // Mapping
  // ─────────────────────────────────────────────────────────────────────────

  private async buildTranscript(threadId: string): Promise<string> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { firstName: true, lastName: true } } },
    });
    const fmt = new Intl.DateTimeFormat('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const names = [
      ...new Set(
        messages.map((m) => [m.sender.firstName, m.sender.lastName].filter(Boolean).join(' ')),
      ),
    ];
    const header = [
      'Chat-transcript (afgerond)',
      names.length ? `Deelnemers: ${names.join(', ')}` : null,
      '',
    ]
      .filter((l) => l !== null)
      .join('\n');
    const lines = messages.map(
      (m) =>
        `[${fmt.format(m.createdAt)}] ${[m.sender.firstName, m.sender.lastName]
          .filter(Boolean)
          .join(' ')}: ${m.content}`,
    );
    return `${header}\n${lines.join('\n')}`.trim();
  }

  private toMessage(
    m: {
      id: string;
      threadId: string;
      senderId: string;
      content: string;
      mentionedUserIds: string[];
      referenceEntityType: string | null;
      referenceEntityId: string | null;
      createdAt: Date;
      sender: { id: string; firstName: string; lastName: string; initials: string | null; avatarUrl: string | null };
    },
    refNames: Map<string, string>,
  ) {
    return {
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId,
      sender: m.sender,
      content: m.content,
      mentionedUserIds: m.mentionedUserIds,
      referenceEntityType: m.referenceEntityType,
      referenceEntityId: m.referenceEntityId,
      referenceName:
        m.referenceEntityType && m.referenceEntityId
          ? refNames.get(`${m.referenceEntityType}:${m.referenceEntityId}`) ?? null
          : null,
      createdAt: m.createdAt,
    };
  }

  private toSummary(
    thread: {
      id: string;
      type: ChatThreadType;
      teamRole: Role | null;
      subject: string | null;
      status: ChatThreadStatus;
      referenceEntityType: string | null;
      referenceEntityId: string | null;
      noteId: string | null;
      closedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      participants?: Array<{ userId: string; user: Record<string, unknown> }>;
      messages?: Array<{
        id: string;
        content: string;
        senderId: string;
        createdAt: Date;
        sender: { firstName: string; lastName: string };
      }>;
    },
    user: User,
    unreadCount: number,
    refNames: Map<string, string>,
  ) {
    const last = thread.messages?.[0] ?? null;
    const lastActivityAt = last?.createdAt ?? thread.createdAt;

    let counterpart: Record<string, unknown> | null = null;
    if (thread.type === ChatThreadType.DIRECT && thread.participants) {
      counterpart = thread.participants.find((p) => p.userId !== user.id)?.user ?? null;
    }

    return {
      id: thread.id,
      type: thread.type,
      teamRole: thread.teamRole,
      subject: thread.subject,
      status: thread.status,
      referenceEntityType: thread.referenceEntityType,
      referenceEntityId: thread.referenceEntityId,
      referenceName:
        thread.referenceEntityType && thread.referenceEntityId
          ? refNames.get(`${thread.referenceEntityType}:${thread.referenceEntityId}`) ?? null
          : null,
      noteId: thread.noteId,
      closedAt: thread.closedAt,
      unreadCount,
      counterpart,
      lastMessage: last
        ? {
            id: last.id,
            content: last.content,
            senderId: last.senderId,
            senderName: [last.sender.firstName, last.sender.lastName].filter(Boolean).join(' '),
            createdAt: last.createdAt,
          }
        : null,
      lastActivityAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }
}
