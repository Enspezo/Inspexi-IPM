import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Availability, ChatThreadType, Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, requireOrg } from '@/common';
import { ChatService } from './chat.service';
import { directKey, isUniqueViolation, teamRolesOf } from './chat.helpers';

/**
 * Additieve /sync v2-uitbreiding (REQ1 PR2) — de brug naar de offline-PWA.
 * Levert een membership-scoped snapshot (threads/messages/presence + tombstones)
 * en past gepushte chat-mutaties toe. Threads/berichten lopen bewust NIET via de
 * generieke sync-mutator: ze vereisen membership-autorisatie + notificatie-
 * dispatch, dus delegeren we naar `ChatService` (core, idempotent op client-UUID).
 */
@Injectable()
export class ChatSyncService {
  constructor(
    private prisma: PrismaService,
    private core: ChatService,
  ) {}

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
    if (!(await this.core.isChatEnabled(orgId))) return empty;
    // Pull is read-only: DIRECT-zichtbaarheid via bestaande participant-rijen,
    // TEAM via rol-membership. Team-threads worden in de portal geprovisioneerd
    // (ensureMyThreads), niet hier — een /sync/pull mag geen rijen schrijven.
    const roles = teamRolesOf(user);

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
    await this.core.assertChatEnabled(requireOrg(user));
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

    const msg = await this.core.sendMessage(
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

  /**
   * Past een via /sync gepushte thread-wijziging toe. Net als berichten lopen
   * threads bewust NIET via de generieke sync-mutator: ze vereisen membership-
   * autorisatie (deelnemer bij DIRECT, rollid bij TEAM) + deterministische dedup
   * (directKey / teamRole). Idempotent op client-UUID zodat replay veilig is; de
   * server kent gezaghebbende timestamps toe (createdAt/updatedAt via Prisma).
   */
  async applySyncThread(
    user: User,
    operation: 'create' | 'update' | 'delete',
    data: Record<string, unknown>,
  ): Promise<{ id: string; status: 'success' }> {
    const orgId = requireOrg(user);
    await this.core.assertChatEnabled(orgId);
    const id = data.id ? String(data.id) : undefined;

    if (operation === 'delete') {
      if (!id) throw new BadRequestException('Thread-id ontbreekt');
      // Replay-veilig: een al verdwenen/afwezige thread (binnen onze org) is een
      // no-op. Bestaat hij wél, dan moet de gebruiker er lid van zijn.
      const existing = await this.prisma.chatThread.findFirst({
        where: { id, orgId },
        select: { id: true, type: true, teamRole: true, deletedAt: true },
      });
      if (!existing || existing.deletedAt) return { id, status: 'success' };
      await this.core.assertThreadMembership(existing, user);
      await this.prisma.chatThread.update({ where: { id }, data: { deletedAt: new Date() } });
      return { id, status: 'success' };
    }

    if (operation === 'update') {
      if (!id) throw new BadRequestException('Thread-id ontbreekt');
      const thread = await this.core.loadAccessibleThread(id, user);
      const patch: Prisma.ChatThreadUpdateInput = {};
      if (data.subject !== undefined) {
        patch.subject = data.subject ? String(data.subject) : null;
      }
      // Referentie alleen koppelen als de thread er nog geen heeft (consistent
      // met de REST-flow); cross-org wordt door assertReferenceInOrg geblokkeerd.
      if (data.referenceEntityType !== undefined && !thread.referenceEntityType) {
        const refType = data.referenceEntityType ? String(data.referenceEntityType) : null;
        const refId = data.referenceEntityId ? String(data.referenceEntityId) : null;
        await this.core.assertReferenceInOrg(refType, refId, orgId);
        patch.referenceEntityType = refType;
        patch.referenceEntityId = refId;
      }
      if (Object.keys(patch).length > 0) {
        await this.prisma.chatThread.update({ where: { id }, data: patch });
      }
      return { id, status: 'success' };
    }

    // create. Idempotent op client-UUID: een al-geadopteerde thread is al gesynct
    // — bevestig membership en geef de id terug.
    if (id) {
      const existing = await this.prisma.chatThread.findFirst({
        where: { id, orgId, deletedAt: null },
        select: { id: true, type: true, teamRole: true },
      });
      if (existing) {
        await this.core.assertThreadMembership(existing, user);
        return { id: existing.id, status: 'success' };
      }
    }

    const type = String(data.type ?? '');
    if (type === ChatThreadType.DIRECT) return this.adoptDirectThread(user, orgId, id, data);
    if (type === ChatThreadType.TEAM) return this.adoptTeamThread(user, orgId, data);
    throw new BadRequestException('Onbekend of ontbrekend thread-type');
  }

  /** Adopteert/dedupt een offline aangemaakte 1-op-1 thread (client-UUID → server). */
  private async adoptDirectThread(
    user: User,
    orgId: string,
    clientId: string | undefined,
    data: Record<string, unknown>,
  ): Promise<{ id: string; status: 'success' }> {
    const otherId = data.userId ? String(data.userId) : '';
    if (!otherId) throw new BadRequestException('userId is vereist voor een 1-op-1 chat');
    if (otherId === user.id) throw new BadRequestException('U kunt geen chat met uzelf starten');
    // Cross-tenant-isolatie: de andere deelnemer moet in dezelfde org zitten.
    const other = await this.prisma.user.findFirst({
      where: { id: otherId, orgId, isDeleted: false },
      select: { id: true },
    });
    if (!other) throw new NotFoundException('Gebruiker niet gevonden');

    const refType = data.referenceEntityType ? String(data.referenceEntityType) : null;
    const refId = data.referenceEntityId ? String(data.referenceEntityId) : null;
    await this.core.assertReferenceInOrg(refType, refId, orgId);

    const key = directKey(user.id, otherId);
    // Bestaat er al een DIRECT-thread voor dit paar, dan is die de bron van
    // waarheid (mogelijk al door pull geleverd) — dedup ernaartoe.
    let thread = await this.prisma.chatThread.findFirst({
      where: { orgId, directKey: key, deletedAt: null },
      select: { id: true },
    });
    if (!thread) {
      try {
        thread = await this.prisma.$transaction(async (tx) => {
          const t = await tx.chatThread.create({
            data: {
              ...(clientId ? { id: clientId } : {}),
              orgId,
              type: ChatThreadType.DIRECT,
              directKey: key,
              subject: data.subject ? String(data.subject) : null,
              referenceEntityType: refType,
              referenceEntityId: refId,
              createdById: user.id,
              deviceId: data.deviceId ? String(data.deviceId) : null,
              syncedAt: new Date(),
            },
            select: { id: true },
          });
          await tx.chatParticipant.createMany({
            data: [
              { threadId: t.id, userId: user.id, lastReadAt: new Date() },
              { threadId: t.id, userId: otherId },
            ],
          });
          return t;
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        thread = await this.prisma.chatThread.findFirst({
          where: { orgId, directKey: key, deletedAt: null },
          select: { id: true },
        });
      }
    }
    if (!thread) throw new NotFoundException('Gesprek niet gevonden');
    return { id: thread.id, status: 'success' };
  }

  /** Zorgt dat de (org+rol-unieke) team-thread bestaat en de gebruiker lid is. */
  private async adoptTeamThread(
    user: User,
    orgId: string,
    data: Record<string, unknown>,
  ): Promise<{ id: string; status: 'success' }> {
    const roleRaw = data.teamRole ? String(data.teamRole) : '';
    if (!roleRaw || !(roleRaw in Role)) {
      throw new BadRequestException('teamRole is vereist voor een team-chat');
    }
    const role = roleRaw as Role;
    if (!user.roles.includes(role)) throw new ForbiddenException('U hoort niet bij dit team');

    let thread = await this.prisma.chatThread.findFirst({
      where: { orgId, type: ChatThreadType.TEAM, teamRole: role, deletedAt: null },
      select: { id: true },
    });
    if (!thread) {
      try {
        thread = await this.prisma.chatThread.create({
          data: {
            orgId,
            type: ChatThreadType.TEAM,
            teamRole: role,
            subject: data.subject ? String(data.subject) : null,
            createdById: user.id,
            deviceId: data.deviceId ? String(data.deviceId) : null,
            syncedAt: new Date(),
          },
          select: { id: true },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        thread = await this.prisma.chatThread.findFirst({
          where: { orgId, type: ChatThreadType.TEAM, teamRole: role, deletedAt: null },
          select: { id: true },
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
    return { id: thread.id, status: 'success' };
  }

  /**
   * Past een via /sync gepushte presence-wijziging toe. De gebruiker komt ALTIJD
   * uit de JWT (nooit uit de payload) — een device kan enkel de eigen status
   * zetten. Raw SQL, net als touchLastSeen, zodat de audit-middleware (User is
   * geaudit) niet bij elke statuswissel ruis logt. `last_seen_at` = nu (server).
   */
  async applySyncPresence(
    user: User,
    data: Record<string, unknown>,
  ): Promise<{ id: string; status: 'success' }> {
    await this.core.assertChatEnabled(requireOrg(user));
    const availability = data.availability ? String(data.availability) : '';
    if (!(availability in Availability)) {
      throw new BadRequestException('Ongeldige beschikbaarheidsstatus');
    }
    const note = data.availabilityNote != null ? String(data.availabilityNote) : null;
    await this.prisma.$executeRaw`
      UPDATE imp_users
      SET availability = ${availability}::"Availability",
          availability_note = ${note},
          last_seen_at = now()
      WHERE id = ${user.id}::uuid
    `;
    // Echo de door de PWA gestuurde id terug (zodat die het item als gesynct
    // markeert); de update zelf gebruikt altijd de JWT-gebruiker.
    return { id: data.id ? String(data.id) : user.id, status: 'success' };
  }
}
