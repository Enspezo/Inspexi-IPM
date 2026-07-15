import { BadRequestException, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { requestContext } from '@/common/services/request-context';
import { AiActionService } from './ai-action.service';

const user = { id: 'u1', orgId: 'orgA', roles: [] } as unknown as User;
const pendingAction = {
  id: 'a1',
  orgId: 'orgA',
  userId: 'u1',
  toolName: 'create_task',
  args: { title: 'Bellen' },
  status: 'PENDING',
} as any;

function makeDeps(sourceSink: { value?: string }, claimCount = 1) {
  const prisma = {
    aiPendingAction: {
      findFirst: jest.fn().mockResolvedValue(pendingAction),
      updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
      update: jest.fn().mockImplementation(({ data }) => ({ ...pendingAction, ...data })),
      findUnique: jest.fn().mockResolvedValue({ ...pendingAction, status: 'REJECTED' }),
    },
  } as any;
  const writeRun = jest.fn().mockImplementation(async () => {
    sourceSink.value = requestContext.getStore()?.source;
    return { id: 'created-task' };
  });
  const registry = {
    get: (n: string) =>
      n === 'create_task' ? { name: 'create_task', mutates: true, run: writeRun } : undefined,
  } as any;
  return { prisma, registry, writeRun };
}

describe('AiActionService', () => {
  it('returns 404 for an action the user does not own', async () => {
    const { prisma, registry } = makeDeps({});
    prisma.aiPendingAction.findFirst.mockResolvedValue(null);
    const svc = new AiActionService(prisma, registry);
    await expect(svc.getOwnedAction('a1', user)).rejects.toThrow(NotFoundException);
  });

  it('executes the write under a source=AI audit context and marks it EXECUTED', async () => {
    const src: { value?: string } = {};
    const { prisma, registry, writeRun } = makeDeps(src);
    const svc = new AiActionService(prisma, registry);

    await svc.confirm('a1', user, '127.0.0.1');

    expect(writeRun).toHaveBeenCalledWith({ user }, { title: 'Bellen' });
    expect(src.value).toBe('AI');
    // Atomische claim
    expect(prisma.aiPendingAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'a1', status: 'PENDING' }),
        data: expect.objectContaining({ status: 'CONFIRMED', confirmedById: 'u1' }),
      }),
    );
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXECUTED' }) }),
    );
  });

  it('applies edited args from the confirmation card', async () => {
    const { prisma, registry, writeRun } = makeDeps({});
    const svc = new AiActionService(prisma, registry);
    await svc.confirm('a1', user, '127.0.0.1', { title: 'Aangepast' });
    expect(writeRun).toHaveBeenCalledWith({ user }, { title: 'Aangepast' });
  });

  it('marks the action FAILED when the write throws', async () => {
    const { prisma, registry, writeRun } = makeDeps({});
    writeRun.mockRejectedValue(new Error('boom'));
    const svc = new AiActionService(prisma, registry);
    await svc.confirm('a1', user, undefined);
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('rejects without executing the tool', async () => {
    const { prisma, registry, writeRun } = makeDeps({});
    const svc = new AiActionService(prisma, registry);
    await svc.reject('a1', user);
    expect(writeRun).not.toHaveBeenCalled();
    expect(prisma.aiPendingAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
    );
  });

  it('refuses to act on an already-handled action (atomic claim loses)', async () => {
    const { prisma, registry } = makeDeps({}, 0); // claim count 0 → already handled
    const svc = new AiActionService(prisma, registry);
    await expect(svc.confirm('a1', user, undefined)).rejects.toThrow(BadRequestException);
  });

  it('executes the write only once under concurrent confirms', async () => {
    const src: { value?: string } = {};
    const { prisma, registry, writeRun } = makeDeps(src);
    // First claim wins (count 1), any subsequent claim loses (count 0).
    prisma.aiPendingAction.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    const svc = new AiActionService(prisma, registry);

    const results = await Promise.allSettled([
      svc.confirm('a1', user, '127.0.0.1'),
      svc.confirm('a1', user, '127.0.0.1'),
    ]);

    expect(writeRun).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
