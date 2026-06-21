import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role, NotificationType, User } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Admin',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockOtherUser = {
    id: 'user-other',
    orgId: 'org-1',
    email: 'other@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Other',
    lastName: 'User',
    roles: [Role.MANAGER],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockNotification = {
    id: 'notif-1',
    orgId: 'org-1',
    userId: 'user-1',
    type: NotificationType.OFFERTE_GOEDGEKEURD,
    title: 'Offerte goedgekeurd',
    body: 'Offerte OFF-2026-0001 is goedgekeurd.',
    entityType: 'quote',
    entityId: 'quote-1',
    isRead: false,
    readAt: null,
    createdAt: new Date('2025-01-01'),
  };

  const mockPrismaService = {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notificationPref: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    notificationGroupPref: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  };

  const mockEmailService = {
    sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-unsubscribe-token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        API_PORT: '3000',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue('mock-unsubscribe-token');
    mockPrismaService.organization.findUnique.mockResolvedValue({
      name: 'Test Org',
      senderName: null,
      senderEmail: null,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  // ─── findAll ─────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return paginated notifications scoped to userId', async () => {
      const notifications = [mockNotification];
      mockPrismaService.notification.findMany.mockResolvedValue(notifications);
      mockPrismaService.notification.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(result).toEqual({
        data: notifications,
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
          }),
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter by type and unread', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        type: NotificationType.OFFERTE_GOEDGEKEURD,
        unread: true,
        page: 1,
        limit: 10,
      });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: NotificationType.OFFERTE_GOEDGEKEURD,
            isRead: false,
          }),
        }),
      );
    });

    it('should filter by model (expands to a set of types)', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll(mockUser, { model: 'TAKEN', page: 1, limit: 20 });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: {
              in: [
                NotificationType.TAAK_TOEGEWEZEN,
                NotificationType.TAAK_STATUS_GEWIJZIGD,
              ],
            },
          }),
        }),
      );
    });

    it('should let type take precedence over model when both are given', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        model: 'TAKEN',
        type: NotificationType.TAAK_TOEGEWEZEN,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: NotificationType.TAAK_TOEGEWEZEN,
          }),
        }),
      );
    });

    it('should yield no results when type lies outside the chosen model', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        model: 'TAKEN',
        type: NotificationType.OFFERTE_GOEDGEKEURD,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { in: [] },
          }),
        }),
      );
    });
  });

  // ─── getUnreadCount ──────────────────────────────────────

  describe('getUnreadCount()', () => {
    it('should return count of unread notifications', async () => {
      mockPrismaService.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(mockUser);

      expect(result).toEqual({ count: 5 });
      expect(mockPrismaService.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });
  });

  // ─── markRead ────────────────────────────────────────────

  describe('markRead()', () => {
    it('should mark notification as read', async () => {
      mockPrismaService.notification.findUnique.mockResolvedValue(mockNotification);
      const readNotif = { ...mockNotification, isRead: true, readAt: new Date() };
      mockPrismaService.notification.update.mockResolvedValue(readNotif);

      const result = await service.markRead('notif-1', mockUser);

      expect(result.isRead).toBe(true);
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException for non-existent notification', async () => {
      mockPrismaService.notification.findUnique.mockResolvedValue(null);

      await expect(
        service.markRead('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for other user notification', async () => {
      const otherNotif = { ...mockNotification, userId: 'user-other' };
      mockPrismaService.notification.findUnique.mockResolvedValue(otherNotif);

      await expect(
        service.markRead('notif-1', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── markAllRead ─────────────────────────────────────────

  describe('markAllRead()', () => {
    it('should update all unread notifications for user', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 3 });

      await service.markAllRead(mockUser);

      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });
  });

  // ─── dispatch ────────────────────────────────────────────

  describe('dispatch()', () => {
    it('should create in-app notification when channelInApp is true (default)', async () => {
      // No user pref → no group pref → defaults to both true
      mockPrismaService.notificationPref.findMany.mockResolvedValue([]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'manager@test.com', roles: [Role.MANAGER] },
      ]);
      mockPrismaService.notificationGroupPref.findMany.mockResolvedValue([]);
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 1 });

      service.dispatch({
        type: NotificationType.OFFERTE_TER_GOEDKEURING,
        orgId: 'org-1',
        recipientUserIds: ['user-1'],
        title: 'Test',
        body: 'Test body',
        entityType: 'quote',
        entityId: 'quote-1',
      });

      // Wait for async doDispatch to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            orgId: 'org-1',
            userId: 'user-1',
            type: NotificationType.OFFERTE_TER_GOEDKEURING,
            title: 'Test',
            body: 'Test body',
            entityType: 'quote',
            entityId: 'quote-1',
          }),
        ],
      });
    });

    it('should send email notification when channelEmail is true (default)', async () => {
      mockPrismaService.notificationPref.findMany.mockResolvedValue([]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'manager@test.com', roles: [Role.MANAGER] },
      ]);
      mockPrismaService.notificationGroupPref.findMany.mockResolvedValue([]);
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 1 });

      service.dispatch({
        type: NotificationType.OFFERTE_TER_GOEDKEURING,
        orgId: 'org-1',
        recipientUserIds: ['user-1'],
        title: 'Email Test',
        body: 'Email test body',
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockEmailService.sendNotificationEmail).toHaveBeenCalledWith(
        'manager@test.com',
        'Email Test',
        'Email test body',
        expect.objectContaining({
          orgId: 'org-1',
          orgName: 'Test Org',
          unsubscribeUrl: expect.stringContaining('mock-unsubscribe-token'),
        }),
      );
    });

    it('should skip in-app notification when user pref channelInApp is false', async () => {
      mockPrismaService.notificationPref.findMany.mockResolvedValue([
        { userId: 'user-1', channelInApp: false, channelEmail: false },
      ]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'manager@test.com', roles: [Role.MANAGER] },
      ]);
      mockPrismaService.notificationGroupPref.findMany.mockResolvedValue([]);

      service.dispatch({
        type: NotificationType.OFFERTE_GOEDGEKEURD,
        orgId: 'org-1',
        recipientUserIds: ['user-1'],
        title: 'Skipped',
        body: 'Should not create notification',
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrismaService.notification.createMany).not.toHaveBeenCalled();
      expect(mockEmailService.sendNotificationEmail).not.toHaveBeenCalled();
    });

    it('should fallback to group pref when no user pref exists', async () => {
      mockPrismaService.notificationPref.findMany.mockResolvedValue([]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'manager@test.com', roles: [Role.MANAGER] },
      ]);
      mockPrismaService.notificationGroupPref.findMany.mockResolvedValue([
        { role: Role.MANAGER, channelInApp: true, channelEmail: false },
      ]);
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 1 });

      service.dispatch({
        type: NotificationType.AANVRAAG_TOEGEWEZEN,
        orgId: 'org-1',
        recipientUserIds: ['user-1'],
        title: 'Group pref test',
        body: 'Uses group pref',
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrismaService.notification.createMany).toHaveBeenCalled();
      expect(mockEmailService.sendNotificationEmail).not.toHaveBeenCalled();
    });

    it('should create in-app rows for all recipients in a single batch', async () => {
      mockPrismaService.notificationPref.findMany.mockResolvedValue([]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-a', email: 'a@test.com', roles: [Role.MANAGER] },
        { id: 'user-b', email: 'b@test.com', roles: [Role.MANAGER] },
      ]);
      mockPrismaService.notificationGroupPref.findMany.mockResolvedValue([]);
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 2 });

      service.dispatch({
        type: NotificationType.OFFERTE_TER_GOEDKEURING,
        orgId: 'org-1',
        recipientUserIds: ['user-a', 'user-b'],
        title: 'Batch test',
        body: 'One insert for both',
      });

      await new Promise((r) => setTimeout(r, 100));

      // Single insert covering both recipients
      expect(mockPrismaService.notification.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ userId: 'user-a' }),
          expect.objectContaining({ userId: 'user-b' }),
        ],
      });
    });

    it('de-duplicates repeated recipient ids into a single row', async () => {
      mockPrismaService.notificationPref.findMany.mockResolvedValue([]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'manager@test.com', roles: [Role.MANAGER] },
      ]);
      mockPrismaService.notificationGroupPref.findMany.mockResolvedValue([]);
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 1 });

      service.dispatch({
        type: NotificationType.OFFERTE_TER_GOEDKEURING,
        orgId: 'org-1',
        recipientUserIds: ['user-1', 'user-1'],
        title: 'Dedup',
        body: 'Only one row',
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ userId: 'user-1' })],
      });
    });
  });

  // ─── saveOwnPrefs ────────────────────────────────────────

  describe('saveOwnPrefs()', () => {
    it('should upsert preferences for each type', async () => {
      const dto = {
        prefs: [
          {
            type: NotificationType.OFFERTE_TER_GOEDKEURING,
            channelInApp: true,
            channelEmail: false,
          },
          {
            type: NotificationType.AANVRAAG_TOEGEWEZEN,
            channelInApp: false,
            channelEmail: true,
          },
        ],
      };

      mockPrismaService.notificationPref.upsert.mockResolvedValue({});
      mockPrismaService.notificationPref.findMany.mockResolvedValue([]);

      await service.saveOwnPrefs(mockUser, dto);

      expect(mockPrismaService.notificationPref.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.notificationPref.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_notificationType: {
              userId: 'user-1',
              notificationType: NotificationType.OFFERTE_TER_GOEDKEURING,
            },
          },
          update: { channelInApp: true, channelEmail: false },
          create: {
            userId: 'user-1',
            notificationType: NotificationType.OFFERTE_TER_GOEDKEURING,
            channelInApp: true,
            channelEmail: false,
          },
        }),
      );
    });
  });
});
