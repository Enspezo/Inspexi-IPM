import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ChatService } from './chat.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';

describe('ChatService — core (shared checks)', () => {
  let service: ChatService;

  const mockPrisma = {
    organization: { findUnique: jest.fn() },
    contact: { findFirst: jest.fn() },
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('isChatEnabled / assertChatEnabled', () => {
    it('reflects the organization flag', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: true });
      await expect(service.isChatEnabled('org-1')).resolves.toBe(true);
      mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: false });
      await expect(service.isChatEnabled('org-1')).resolves.toBe(false);
    });

    it('treats an unknown org as disabled', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.isChatEnabled('org-x')).resolves.toBe(false);
    });

    it('assertChatEnabled throws when chat is disabled', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: false });
      await expect(service.assertChatEnabled('org-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertReferenceInOrg', () => {
    it('is a no-op when both type and id are absent', async () => {
      await expect(service.assertReferenceInOrg(null, null, 'org-1')).resolves.toBeUndefined();
      expect(mockPrisma.contact.findFirst).not.toHaveBeenCalled();
    });

    it('throws when only one of type/id is provided', async () => {
      await expect(service.assertReferenceInOrg('Contact', null, 'org-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.assertReferenceInOrg(null, 'id-1', 'org-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an unknown reference type', async () => {
      await expect(
        service.assertReferenceInOrg('Banana', 'id-1', 'org-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unreadByThread', () => {
    it('returns an empty map without querying when there are no thread ids', async () => {
      const res = await service.unreadByThread(user.id, []);
      expect(res.size).toBe(0);
    });
  });
});
