import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChatThreadType, Role } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChatThreadsService } from './chat-threads.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';

describe('ChatThreadsService', () => {
  let service: ChatThreadsService;

  const mockPrisma = {
    organization: { findUnique: jest.fn() },
    chatThread: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    chatParticipant: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatThreadsService,
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ChatThreadsService>(ChatThreadsService);
  });

  describe('createThread — DIRECT validation', () => {
    it('rejects a 1-op-1 chat without a target userId', async () => {
      await expect(
        service.createThread(user, { type: ChatThreadType.DIRECT } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects starting a chat with yourself', async () => {
      await expect(
        service.createThread(user, { type: ChatThreadType.DIRECT, userId: user.id } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('searchUsers', () => {
    it('returns [] when chat is disabled for the org', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: false });
      await expect(service.searchUsers(user, {} as any)).resolves.toEqual([]);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('queries org users (excluding self) when enabled', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-2' }]);
      const res = await service.searchUsers(user, { q: 'an' } as any);
      expect(res).toEqual([{ id: 'user-2' }]);
      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.orgId).toBe('org-1');
      expect(where.id).toEqual({ not: user.id });
    });
  });

  describe('getUnread', () => {
    it('returns { count: 0 } for a user without an org', async () => {
      await expect(service.getUnread({ ...user, orgId: null } as any)).resolves.toEqual({ count: 0 });
    });
  });
});
