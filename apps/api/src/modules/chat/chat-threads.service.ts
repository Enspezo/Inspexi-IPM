import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatThreadType, Prisma, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { requireOrg } from '@/common';
import { ChatService } from './chat.service';
import { CreateThreadDto, SearchChatUsersQueryDto } from './dto';
import {
  directKey,
  isUniqueViolation,
  MESSAGE_SENDER,
  resolveReferenceNames,
  teamRolesOf,
  toSummary,
  USER_SUMMARY,
} from './chat.helpers';

/**
 * Thread-lifecycle voor de REST-portal: overzicht, 1-op-1/team aanmaken, read-
 * state en gebruikerszoek. Bouwt op `ChatService` (core) voor de gedeelde org-
 * scoped checks, thread-provisioning en ongelezen-tellingen.
 */
@Injectable()
export class ChatThreadsService {
  constructor(
    private prisma: PrismaService,
    private core: ChatService,
  ) {}

  async listThreads(user: User) {
    if (!user.orgId) return [];
    const orgId = user.orgId;
    if (!(await this.core.isChatEnabled(orgId))) return [];
    await this.core.ensureMyThreads(user, orgId);
    const roles = teamRolesOf(user);

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
      this.core.unreadByThread(user.id, all.map((t) => t.id)),
      resolveReferenceNames(this.prisma, all),
    ]);

    const summaries = all.map((t) =>
      toSummary(t, user, unread.get(t.id) ?? 0, refNames),
    );
    summaries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    return summaries;
  }

  async createThread(user: User, dto: CreateThreadDto) {
    const orgId = requireOrg(user);
    await this.core.assertChatEnabled(orgId);
    await this.core.assertReferenceInOrg(dto.referenceEntityType, dto.referenceEntityId, orgId);

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

    const key = directKey(user.id, dto.userId);
    let thread = await this.prisma.chatThread.findFirst({
      where: { orgId, directKey: key, deletedAt: null },
      select: { id: true, referenceEntityType: true },
    });

    if (!thread) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const t = await tx.chatThread.create({
            data: {
              orgId,
              type: ChatThreadType.DIRECT,
              directKey: key,
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
          where: { orgId, directKey: key, deletedAt: null },
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
    return this.core.getThread(thread.id, user);
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
    return this.core.getThread(thread.id, user);
  }

  async markRead(threadId: string, user: User) {
    await this.core.assertChatEnabled(requireOrg(user));
    await this.core.loadAccessibleThread(threadId, user);
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
    this.core.touchLastSeen(user.id);
    return { success: true };
  }

  async getUnread(user: User) {
    if (!user.orgId) return { count: 0 };
    if (!(await this.core.isChatEnabled(user.orgId))) return { count: 0 };
    await this.core.ensureMyThreads(user, user.orgId);
    this.core.touchLastSeen(user.id);
    const ids = await this.core.myThreadIds(user, user.orgId);
    const unread = await this.core.unreadByThread(user.id, ids);
    let count = 0;
    for (const n of unread.values()) count += n;
    return { count };
  }

  async searchUsers(user: User, query: SearchChatUsersQueryDto) {
    if (!user.orgId) return [];
    if (!(await this.core.isChatEnabled(user.orgId))) return [];
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
}
