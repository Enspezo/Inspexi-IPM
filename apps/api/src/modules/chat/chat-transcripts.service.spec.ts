import { Test, TestingModule } from '@nestjs/testing';
import { ChatThreadStatus, ChatThreadType, Role } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChatTranscriptsService } from './chat-transcripts.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { NotesService } from '../notes/notes.service';

describe('ChatTranscriptsService', () => {
  let service: ChatTranscriptsService;
  const notesCreate = jest.fn();

  const thread = {
    id: 't-1',
    orgId: 'org-1',
    type: ChatThreadType.DIRECT,
    teamRole: null,
    subject: null,
    status: ChatThreadStatus.AFGEROND,
    referenceEntityType: null,
    referenceEntityId: null,
    noteId: 'note-x',
    closedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [],
    messages: [],
  };

  const mockPrisma = {
    organization: { findUnique: jest.fn().mockResolvedValue({ chatEnabled: true }) },
    chatThread: { findFirst: jest.fn().mockResolvedValue(thread), update: jest.fn() },
    chatParticipant: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1' }) },
    chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ chatEnabled: true });
    mockPrisma.chatThread.findFirst.mockResolvedValue(thread);
    mockPrisma.chatParticipant.findUnique.mockResolvedValue({ id: 'p-1' });
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatTranscriptsService,
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: {} },
        { provide: NotesService, useValue: { create: notesCreate } },
      ],
    }).compile();

    service = module.get<ChatTranscriptsService>(ChatTranscriptsService);
  });

  it('is a no-op on an already-closed thread: no note, no status write', async () => {
    const res = await service.closeThread('t-1', user);

    expect(res.id).toBe('t-1');
    expect(notesCreate).not.toHaveBeenCalled();
    expect(mockPrisma.chatThread.update).not.toHaveBeenCalled();
  });
});
