import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ChatService } from './chat.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { NotesService } from '../notes/notes.service';

describe('ChatService — sync push (threads & presence)', () => {
  let service: ChatService;

  const mockPrisma = {
    organization: { findUnique: jest.fn() },
    chatThread: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    chatParticipant: { findUnique: jest.fn(), createMany: jest.fn(), upsert: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Chat is enabled for the org by default.
    mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: {} },
        { provide: NotesService, useValue: {} },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('applySyncThread — create idempotency', () => {
    it('adopts a fresh DIRECT thread with the client-UUID and adds both participants', async () => {
      // No existing thread by client-id, none by directKey → create.
      mockPrisma.chatThread.findFirst.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-2' }); // other participant in org
      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          chatThread: { create: jest.fn().mockResolvedValue({ id: 'client-uuid' }) },
          chatParticipant: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        }),
      );

      const res = await service.applySyncThread(user, 'create', {
        id: 'client-uuid',
        type: 'DIRECT',
        userId: 'user-2',
      });

      expect(res).toEqual({ id: 'client-uuid', status: 'success' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: an already-adopted thread (same client-id) is not re-created', async () => {
      // First lookup (by client-id) finds the thread → early return, no create.
      mockPrisma.chatThread.findFirst.mockResolvedValueOnce({
        id: 'client-uuid',
        type: 'DIRECT',
        teamRole: null,
      });
      mockPrisma.chatParticipant.findUnique.mockResolvedValue({ id: 'part-1' }); // membership ok

      const res = await service.applySyncThread(user, 'create', {
        id: 'client-uuid',
        type: 'DIRECT',
        userId: 'user-2',
      });

      expect(res).toEqual({ id: 'client-uuid', status: 'success' });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.chatThread.create).not.toHaveBeenCalled();
    });

    it('dedups to an existing DIRECT thread for the same pair (server is source of truth)', async () => {
      mockPrisma.chatThread.findFirst
        .mockResolvedValueOnce(null) // no thread by client-id
        .mockResolvedValueOnce({ id: 'server-thread' }); // existing by directKey
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-2' });

      const res = await service.applySyncThread(user, 'create', {
        id: 'client-uuid',
        type: 'DIRECT',
        userId: 'user-2',
      });

      expect(res).toEqual({ id: 'server-thread', status: 'success' });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a DIRECT thread whose other participant is in another org (cross-tenant)', async () => {
      mockPrisma.chatThread.findFirst.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null); // other user not found in this org

      await expect(
        service.applySyncThread(user, 'create', {
          id: 'client-uuid',
          type: 'DIRECT',
          userId: 'foreign-user',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a TEAM thread for a role the user does not hold', async () => {
      mockPrisma.chatThread.findFirst.mockResolvedValue(null);

      await expect(
        service.applySyncThread(user, 'create', { id: 't-team', type: 'TEAM', teamRole: 'MANAGER' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('applySyncPresence — update', () => {
    it('updates the JWT user (never the payload id) and echoes the sent id', async () => {
      const res = await service.applySyncPresence(user, {
        id: 'pwa-presence-id',
        availability: 'BEZIG',
        availabilityNote: 'In bespreking',
      });

      expect(res).toEqual({ id: 'pwa-presence-id', status: 'success' });
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      // Raw SQL is a tagged template; the JWT user-id must be one of the bound values.
      const boundValues = mockPrisma.$executeRaw.mock.calls[0].slice(1);
      expect(boundValues).toContain(user.id);
      expect(boundValues).not.toContain('pwa-presence-id');
    });

    it('rejects an invalid availability status', async () => {
      await expect(
        service.applySyncPresence(user, { availability: 'NONSENSE' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
