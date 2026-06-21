import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User, Role, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, assertFound } from '@/common';
import { EmailService } from '@/common/services/email.service';
import {
  ListNotificationsQueryDto,
  SavePrefsDto,
  SaveGroupPrefsDto,
} from './dto';
import { getTypesForModel } from './notifications.constants';

interface DispatchParams {
  type: NotificationType;
  orgId: string;
  recipientUserIds: string[];
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  // ─── Fire-and-forget dispatch ──────────────────────────

  dispatch(params: DispatchParams): void {
    this.doDispatch(params).catch((err) => {
      this.logger.error('Notification dispatch failed', err);
    });
  }

  private async doDispatch(params: DispatchParams): Promise<void> {
    const { type, orgId, recipientUserIds, title, body, entityType, entityId } =
      params;

    const uniqueIds = [...new Set(recipientUserIds)];
    if (uniqueIds.length === 0) return;

    // Batch every lookup up-front (org + users + user-prefs + group-prefs) so
    // dispatch to N recipients costs a constant number of queries instead of
    // 2–4 per recipient.
    const [org, users, userPrefs, groupPrefs] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, senderName: true, senderEmail: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, email: true, roles: true },
      }),
      this.prisma.notificationPref.findMany({
        where: { userId: { in: uniqueIds }, notificationType: type },
      }),
      this.prisma.notificationGroupPref.findMany({
        where: { orgId, notificationType: type },
      }),
    ]);

    const usersById = new Map(users.map((u) => [u.id, u]));
    const userPrefByUserId = new Map(userPrefs.map((p) => [p.userId, p]));

    const resolved = uniqueIds.map((userId) => {
      const user = usersById.get(userId);
      return {
        userId,
        email: user?.email ?? null,
        pref: this.resolvePreference(
          userPrefByUserId.get(userId),
          user?.roles ?? [],
          groupPrefs,
        ),
      };
    });

    // 1. Bulk-create all in-app notifications in a single insert.
    const inAppData = resolved
      .filter((r) => r.pref.channelInApp)
      .map((r) => ({ orgId, userId: r.userId, type, title, body, entityType, entityId }));
    if (inAppData.length > 0) {
      await this.prisma.notification.createMany({ data: inAppData });
    }

    // 2. Send emails — each send is independent and fire-and-forget.
    const apiPort = this.config.get<string>('API_PORT', '3000');
    const apiBaseUrl = this.config.get<string>('API_BASE_URL', `http://localhost:${apiPort}`);
    for (const r of resolved) {
      if (!r.pref.channelEmail || !r.email) continue;
      const unsubscribeToken = this.generateUnsubscribeToken(r.userId);
      const unsubscribeUrl = `${apiBaseUrl}/api/v1/notifications/unsubscribe?token=${unsubscribeToken}`;
      this.emailService
        .sendNotificationEmail(r.email, title, body, {
          senderName: org?.senderName,
          senderEmail: org?.senderEmail,
          unsubscribeUrl,
          orgId,
          orgName: org?.name ?? undefined,
        })
        .catch((err) => this.logger.error('Notification email failed', err));
    }
  }

  /**
   * Resolve a recipient's channel preference from already-fetched data (no I/O):
   * user-level pref → any matching group pref (by role) → default both on.
   */
  private resolvePreference(
    userPref: { channelInApp: boolean; channelEmail: boolean } | undefined,
    roles: Role[],
    groupPrefs: { role: Role; channelInApp: boolean; channelEmail: boolean }[],
  ): { channelInApp: boolean; channelEmail: boolean } {
    // 1. User-level pref
    if (userPref) {
      return {
        channelInApp: userPref.channelInApp,
        channelEmail: userPref.channelEmail,
      };
    }

    // 2. Group-level pref — any of the user's roles
    if (roles.length > 0) {
      const relevant = groupPrefs.filter((p) => roles.includes(p.role));
      if (relevant.length > 0) {
        return {
          channelInApp: relevant.some((p) => p.channelInApp),
          channelEmail: relevant.some((p) => p.channelEmail),
        };
      }
    }

    // 3. Default: both enabled
    return { channelInApp: true, channelEmail: true };
  }

  // ─── CRUD for controllers ─────────────────────────────

  async findAll(user: User, query: ListNotificationsQueryDto) {
    const { model, type, unread, page = 1, limit = 20 } = query;

    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
    };

    // `type` heeft voorrang op `model`; valt `type` buiten het gekozen model,
    // dan levert de combinatie bewust geen resultaten op.
    if (type) {
      where.type =
        model && !getTypesForModel(model).includes(type)
          ? { in: [] }
          : type;
    } else if (model) {
      where.type = { in: getTypesForModel(model) };
    }

    if (unread !== undefined) {
      where.isRead = !unread;
    }

    return paginate(this.prisma.notification, {
      where,
      orderBy: { createdAt: 'desc' },
      page,
      limit,
    });
  }

  async getUnreadCount(user: User) {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, user: User) {
    const notification = assertFound(
      await this.prisma.notification.findUnique({
        where: { id },
      }),
      'Notificatie',
    );

    if (notification.userId !== user.id) {
      throw new ForbiddenException();
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(user: User) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  // ─── User preferences ─────────────────────────────────

  async getOwnPrefs(user: User) {
    return this.prisma.notificationPref.findMany({
      where: { userId: user.id },
    });
  }

  async saveOwnPrefs(user: User, dto: SavePrefsDto) {
    for (const item of dto.prefs) {
      await this.prisma.notificationPref.upsert({
        where: {
          userId_notificationType: {
            userId: user.id,
            notificationType: item.type,
          },
        },
        update: {
          channelInApp: item.channelInApp,
          channelEmail: item.channelEmail,
        },
        create: {
          userId: user.id,
          notificationType: item.type,
          channelInApp: item.channelInApp,
          channelEmail: item.channelEmail,
        },
      });
    }

    return this.getOwnPrefs(user);
  }

  // ─── Group preferences (ORG_ADMIN / SUPERUSER) ─────────

  async getGroupPrefs(user: User) {
    if (user.roles.includes(Role.SUPERUSER)) {
      return this.prisma.notificationGroupPref.findMany();
    }

    return this.prisma.notificationGroupPref.findMany({
      where: { orgId: user.orgId! },
    });
  }

  async saveGroupPrefs(user: User, dto: SaveGroupPrefsDto) {
    const orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    for (const item of dto.prefs) {
      const targetOrgId = orgId!;
      await this.prisma.notificationGroupPref.upsert({
        where: {
          orgId_role_notificationType: {
            orgId: targetOrgId,
            role: item.role,
            notificationType: item.type,
          },
        },
        update: {
          channelInApp: item.channelInApp,
          channelEmail: item.channelEmail,
        },
        create: {
          orgId: targetOrgId,
          role: item.role,
          notificationType: item.type,
          channelInApp: item.channelInApp,
          channelEmail: item.channelEmail,
        },
      });
    }

    return this.getGroupPrefs(user);
  }

  // ─── Unsubscribe token ─────────────────────────────────

  generateUnsubscribeToken(userId: string): string {
    const secret = this.config.get<string>('JWT_SECRET');
    return this.jwtService.sign(
      { sub: userId, purpose: 'unsubscribe' },
      { secret, expiresIn: '90d' },
    );
  }

  async processUnsubscribe(token: string): Promise<void> {
    let payload: any;
    try {
      const secret = this.config.get<string>('JWT_SECRET');
      payload = this.jwtService.verify(token, { secret });
    } catch {
      throw new BadRequestException('Ongeldige of verlopen afmeldingslink');
    }

    if (payload.purpose !== 'unsubscribe' || !payload.sub) {
      throw new BadRequestException('Ongeldige token');
    }

    const userId = payload.sub as string;

    // Disable email for ALL notification types by upserting each pref
    const allTypes = Object.values(NotificationType);
    for (const type of allTypes) {
      await this.prisma.notificationPref.upsert({
        where: { userId_notificationType: { userId, notificationType: type } },
        update: { channelEmail: false },
        create: {
          userId,
          notificationType: type,
          channelInApp: true,
          channelEmail: false,
        },
      });
    }
  }
}
