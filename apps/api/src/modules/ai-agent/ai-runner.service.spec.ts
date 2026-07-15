import { User } from '@prisma/client';
import { AiRunnerService, SseSink } from './ai-runner.service';

function fakeStream(final: any) {
  return { on: jest.fn(), finalMessage: jest.fn().mockResolvedValue(final) };
}

const conversation = {
  id: 'c1',
  orgId: 'orgA',
  model: 'claude-sonnet-5',
  title: null,
} as any;
const user = { id: 'u1', orgId: 'orgA' } as User;

function makeDeps() {
  const prisma = {
    aiMessage: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest
        .fn()
        .mockResolvedValue([{ role: 'USER', content: [{ type: 'text', text: 'hallo' }] }]),
    },
    aiConversation: { update: jest.fn().mockResolvedValue({}) },
  } as any;
  const usage = {
    assertWithinQuota: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined),
  } as any;
  const runMock = jest.fn().mockResolvedValue({ id: 't1', title: 'Taak' });
  const registry = {
    list: () => [
      { name: 'get_task', description: 'd', inputSchema: { type: 'object' }, mutates: false, run: runMock },
    ],
    get: (n: string) =>
      n === 'get_task' ? { name: 'get_task', mutates: false, run: runMock } : undefined,
  } as any;
  const sink: SseSink = { send: jest.fn(), close: jest.fn() };
  return { prisma, usage, registry, runMock, sink };
}

describe('AiRunnerService.streamTurn', () => {
  it('runs the tool loop: executes a read tool then finishes', async () => {
    const { prisma, usage, registry, runMock, sink } = makeDeps();
    const anthropic = { messages: { stream: jest.fn() } } as any;
    anthropic.messages.stream
      .mockReturnValueOnce(
        fakeStream({
          content: [{ type: 'tool_use', id: 'tu1', name: 'get_task', input: { id: 't1' } }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
        }),
      )
      .mockReturnValueOnce(
        fakeStream({
          content: [{ type: 'text', text: 'Klaar' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 3, output_tokens: 2 },
        }),
      );

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.streamTurn(conversation, 'hallo', user, sink);

    // Quota gecheckt vóór de call
    expect(usage.assertWithinQuota).toHaveBeenCalledWith('orgA');
    // Tool uitgevoerd als de gebruiker
    expect(runMock).toHaveBeenCalledWith({ user }, { id: 't1' });
    // Twee model-calls → twee usage-regels
    expect(usage.record).toHaveBeenCalledTimes(2);
    // user + assistant(1) + tool_result + assistant(2) = 4 berichten
    expect(prisma.aiMessage.create).toHaveBeenCalledTimes(4);
    // Titel afgeleid van het eerste bericht
    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'hallo' }) }),
    );
    // Afgesloten met done
    expect(sink.send).toHaveBeenCalledWith('done', {});
    expect(sink.close).toHaveBeenCalled();
  });

  it('reports a friendly error and stops when not configured (no key)', async () => {
    const { prisma, usage, registry, sink } = makeDeps();
    const runner = new AiRunnerService(null, prisma, usage, registry);
    await runner.streamTurn(conversation, 'hallo', user, sink);

    expect(runner.isConfigured).toBe(false);
    expect(usage.assertWithinQuota).not.toHaveBeenCalled();
    expect(sink.send).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
    expect(sink.close).toHaveBeenCalled();
  });

  it('surfaces a quota block as an SSE error and never calls the model', async () => {
    const { prisma, usage, registry, sink } = makeDeps();
    usage.assertWithinQuota.mockRejectedValue(new Error('Het AI-tegoed voor deze maand is bereikt'));
    const anthropic = { messages: { stream: jest.fn() } } as any;

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.streamTurn(conversation, 'hallo', user, sink);

    expect(anthropic.messages.stream).not.toHaveBeenCalled();
    expect(sink.send).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: 'Het AI-tegoed voor deze maand is bereikt' }),
    );
    expect(sink.close).toHaveBeenCalled();
  });
});
