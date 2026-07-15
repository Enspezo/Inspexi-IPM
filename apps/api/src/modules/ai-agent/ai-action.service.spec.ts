import { BadRequestException, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { requestContext } from '@/common/services/request-context';
import { AiActionService } from './ai-action.service';

const user = { id: 'u1', orgId: 'orgA' } as User;
const pendingAction = {
  id: 'a1',
  orgId: 'orgA',
  userId: 'u1',
  toolName: 'create_task',
  args: { title: 'Bellen' },
  status: 'PENDING',
} as any;

function makeDeps(sourceSink: { value?: string }) {
  const prisma = {
    aiPendingAction: {
      findFirst: jest.fn().mockResolvedValue(pendingAction),
      update: jest.fn().mockImplementation(({ data }) => ({ ...pendingAction, ...data })),
    },
  } as any;
  const writeRun = jest.fn().mockImplementation(async () => {
    // Vang de auditbron zoals de mutatie die zou zien.
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
    const src: { value?: string } = {};
    const { prisma, registry } = makeDeps(src);
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
    expect(src.value).toBe('AI'); // de mutatie draaide in een AI-context
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXECUTED', confirmedById: 'u1' }),
      }),
    );
  });

  it('applies edited args from the confirmation card', async () => {
    const src: { value?: string } = {};
    const { prisma, registry, writeRun } = makeDeps(src);
    const svc = new AiActionService(prisma, registry);

    await svc.confirm('a1', user, '127.0.0.1', { title: 'Aangepast' });
    expect(writeRun).toHaveBeenCalledWith({ user }, { title: 'Aangepast' });
  });

  it('marks the action FAILED when the write throws', async () => {
    const src: { value?: string } = {};
    const { prisma, registry, writeRun } = makeDeps(src);
    writeRun.mockRejectedValue(new Error('boom'));
    const svc = new AiActionService(prisma, registry);

    await svc.confirm('a1', user, undefined);
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('rejects without executing the tool', async () => {
    const src: { value?: string } = {};
    const { prisma, registry, writeRun } = makeDeps(src);
    const svc = new AiActionService(prisma, registry);

    await svc.reject('a1', user);
    expect(writeRun).not.toHaveBeenCalled();
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
  });

  it('refuses to act on an already-handled action', async () => {
    const src: { value?: string } = {};
    const { prisma, registry } = makeDeps(src);
    prisma.aiPendingAction.findFirst.mockResolvedValue({ ...pendingAction, status: 'EXECUTED' });
    const svc = new AiActionService(prisma, registry);
    await expect(svc.confirm('a1', user, undefined)).rejects.toThrow(BadRequestException);
  });
});
