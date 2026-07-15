import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AiAgentService } from './ai-agent.service';

const orgUser = { id: 'u1', orgId: 'orgA' } as User;
const superUser = { id: 'su', orgId: null } as User;

function makePrisma() {
  return {
    aiConversation: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'c1', ...data })),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

const config = { get: (_k: string, d: string) => d } as any;

describe('AiAgentService', () => {
  let prisma: any;
  let service: AiAgentService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AiAgentService(prisma, config);
  });

  it('scopes the conversation list to org + user', async () => {
    await service.listConversations(orgUser);
    expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'orgA', userId: 'u1', archivedAt: null },
      }),
    );
  });

  it('rejects a user without an organisation (superuser)', () => {
    expect(() => service.requireOrg(superUser)).toThrow(ForbiddenException);
  });

  it('stores orgId, userId and the resolved model on create', async () => {
    await service.createConversation(orgUser, { title: 'Test' });
    expect(prisma.aiConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'orgA',
          userId: 'u1',
          title: 'Test',
          model: 'claude-sonnet-5',
        }),
      }),
    );
  });

  it('returns 404 for a conversation the user does not own / cross-tenant', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);
    await expect(service.getOwnedConversation('c1', orgUser)).rejects.toThrow(
      NotFoundException,
    );
    // The query itself is org+user scoped
    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', orgId: 'orgA', userId: 'u1' },
    });
  });

  it('archives only after the ownership check passes', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1' });
    await service.archiveConversation('c1', orgUser);
    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );
  });
});
