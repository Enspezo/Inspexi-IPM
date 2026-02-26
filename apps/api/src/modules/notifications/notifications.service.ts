import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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

    // Fetch org sender config once for all recipients
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { senderName: true, senderEmail: true },
    });

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
            const unsubscribeToken = this.generateUnsubscribeToken(userId);
            const apiPort = this.config.get<string>('API_PORT', '3000');
            const apiBaseUrl = this.config.get<string>('API_BASE_URL', `http://localhost:${apiPort}`);
            const unsubscribeUrl = `${apiBaseUrl}/api/v1/notifications/unsubscribe?token=${unsubscribeToken}`;
            this.emailService
              .sendNotificationEmail(user.email, title, body, {
                senderName: org?.senderName,
                senderEmail: org?.senderEmail,
                unsubscribeUrl,
              })
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
