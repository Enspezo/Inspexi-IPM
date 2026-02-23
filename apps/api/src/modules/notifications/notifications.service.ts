import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';
import {
  ListNotificationsQueryDto,
  SavePrefsDto,
  SaveGroupPrefsDto,
} from './dto';

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

    for (const userId of recipientUserIds) {
      try {
        const pref = await this.resolvePreference(userId, orgId, type);

        if (pref.channelInApp) {
          await this.prisma.notification.create({
            data: { orgId, userId, type, title, body, entityType, entityId },
          });
        }

        if (pref.channelEmail) {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          });
          if (user?.email) {
            this.emailService
              .sendNotificationEmail(user.email, title, body)
              .catch((err) =>
                this.logger.error('Notification email failed', err),
              );
          }
        }
      } catch (err) {
        this.logger.error(`Notification failed for user ${userId}`, err);
      }
    }
  }

  private async resolvePreference(
    userId: string,
    orgId: string,
    type: NotificationType,
  ): Promise<{ channelInApp: boolean; channelEmail: boolean }> {
    // 1. User-level pref
    const userPref = await this.prisma.notificationPref.findUnique({
      where: {
        userId_notificationType: { userId, notificationType: type },
      },
    });
    if (userPref) {
      return {
        channelInApp: userPref.channelInApp,
        channelEmail: userPref.channelEmail,
      };
    }

    // 2. Group-level pref
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user) {
      const groupPref = await this.prisma.notificationGroupPref.findUnique({
        where: {
          orgId_role_notificationType: {
            orgId,
            role: user.role,
            notificationType: type,
          },
        },
      });
      if (groupPref) {
        return {
          channelInApp: groupPref.channelInApp,
          channelEmail: groupPref.channelEmail,
        };
      }
    }

    // 3. Default: both enabled
    return { channelInApp: true, channelEmail: true };
  }

  // ─── CRUD for controllers ─────────────────────────────

  async findAll(user: User, query: ListNotificationsQueryDto) {
    const { type, unread, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
    };

    if (type) {
      where.type = type;
    }

    if (unread !== undefined) {
      where.isRead = !unread;
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getUnreadCount(user: User) {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, user: User) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notificatie niet gevonden');
    }

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
    if (user.role === Role.SUPERUSER) {
      return this.prisma.notificationGroupPref.findMany();
    }

    return this.prisma.notificationGroupPref.findMany({
      where: { orgId: user.orgId! },
    });
  }

  async saveGroupPrefs(user: User, dto: SaveGroupPrefsDto) {
    const orgId = user.orgId;
    if (!orgId && user.role !== Role.SUPERUSER) {
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
}
