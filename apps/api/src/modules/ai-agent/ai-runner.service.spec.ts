import { User } from '@prisma/client';
import { AiRunnerService, SseSink } from './ai-runner.service';

function fakeStream(final: any) {
  return { on: jest.fn(), finalMessage: jest.fn().mockResolvedValue(final) };
}

/** Gemockte gedeelde AnthropicClientService (zoals de ai-review-specs mocken). */
function fakeAnthropicClient(available = true) {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    streamMessage: jest.fn(),
  } as any;
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
      create: jest.fn().mockResolvedValue({ id: 'am1' }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ role: 'USER', content: [{ type: 'text', text: 'hallo' }] }]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    aiPendingAction: {
      create: jest.fn().mockResolvedValue({ id: 'act1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiConversation: { update: jest.fn().mockResolvedValue({}) },
  } as any;
  const usage = {
    assertWithinQuota: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined),
  } as any;
  const readRun = jest.fn().mockResolvedValue({ id: 't1' });
  const writeRun = jest.fn().mockResolvedValue({ id: 'new-task' });
  const registry = {
    list: () => [
      { name: 'get_task', description: 'd', inputSchema: { type: 'object' }, mutates: false, run: readRun },
      { name: 'create_task', description: 'd', inputSchema: { type: 'object' }, mutates: true, run: writeRun, summarize: () => 'Taak aanmaken' },
    ],
    get: (n: string) => {
      if (n === 'get_task') return { name: 'get_task', mutates: false, run: readRun };
      if (n === 'create_task')
        return { name: 'create_task', mutates: true, run: writeRun, summarize: () => 'Taak aanmaken' };
      return undefined;
    },
  } as any;
  const sink: SseSink = { send: jest.fn(), close: jest.fn() };
  return { prisma, usage, registry, readRun, writeRun, sink };
}

describe('AiRunnerService.streamTurn — read loop', () => {
  it('executes a read tool then finishes', async () => {
    const { prisma, usage, registry, readRun, sink } = makeDeps();
    const anthropic = fakeAnthropicClient();
    anthropic.streamMessage
      .mockReturnValueOnce(
        fakeStream({
          content: [{ type: 'tool_use', id: 'tu1', name: 'get_task', input: { id: 't1' } }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      )
      .mockReturnValueOnce(
        fakeStream({ content: [{ type: 'text', text: 'Klaar' }], stop_reason: 'end_turn', usage: {} }),
      );

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.streamTurn(conversation, 'hallo', user, sink);

    expect(usage.assertWithinQuota).toHaveBeenCalledWith('orgA');
    expect(readRun).toHaveBeenCalledWith({ user }, { id: 't1' });
    expect(prisma.aiPendingAction.create).not.toHaveBeenCalled();
    expect(sink.send).toHaveBeenCalledWith('done', {});
  });
});

describe('AiRunnerService.streamTurn — write halt', () => {
  it('pauses on a write tool: creates a PENDING action, does NOT execute it', async () => {
    const { prisma, usage, registry, writeRun, sink } = makeDeps();
    const anthropic = fakeAnthropicClient();
    anthropic.streamMessage.mockReturnValueOnce(
      fakeStream({
        content: [{ type: 'tool_use', id: 'tu1', name: 'create_task', input: { title: 'X' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 8, output_tokens: 4 },
      }),
    );

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.streamTurn(conversation, 'maak een taak', user, sink);

    // De write is NIET uitgevoerd tijdens de beurt
    expect(writeRun).not.toHaveBeenCalled();
    // Er is een PENDING-actie aangemaakt
    expect(prisma.aiPendingAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toolName: 'create_task', status: 'PENDING' }),
      }),
    );
    // De client kreeg de bevestigingskaart + een gepauzeerde 'done'
    expect(sink.send).toHaveBeenCalledWith('pending_actions', expect.any(Object));
    expect(sink.send).toHaveBeenCalledWith('done', { paused: true });
    // Slechts één model-call
    expect(usage.record).toHaveBeenCalledTimes(1);
  });

  it('in a mixed read+write turn: runs the read, defers the write, still halts', async () => {
    const { prisma, usage, registry, readRun, writeRun, sink } = makeDeps();
    const anthropic = fakeAnthropicClient();
    anthropic.streamMessage.mockReturnValueOnce(
      fakeStream({
        content: [
          { type: 'tool_use', id: 'r1', name: 'get_task', input: { id: 't1' } },
          { type: 'tool_use', id: 'w1', name: 'create_task', input: { title: 'X' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 9, output_tokens: 4 },
      }),
    );

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.streamTurn(conversation, 'zoek en maak', user, sink);

    // Read uitgevoerd; write niet
    expect(readRun).toHaveBeenCalledWith({ user }, { id: 't1' });
    expect(writeRun).not.toHaveBeenCalled();
    // Twee actie-rijen: read EXECUTED + write PENDING
    expect(prisma.aiPendingAction.create).toHaveBeenCalledTimes(2);
    const statuses = prisma.aiPendingAction.create.mock.calls.map((c: any[]) => c[0].data.status);
    expect(statuses).toEqual(expect.arrayContaining(['EXECUTED', 'PENDING']));
    // Gepauzeerd met één kaart (alleen de write)
    expect(sink.send).toHaveBeenCalledWith('done', { paused: true });
  });

  it('blocks a new message while a tool_use turn is still open', async () => {
    const { prisma, usage, registry, sink } = makeDeps();
    prisma.aiMessage.findFirst.mockResolvedValue({
      role: 'ASSISTANT',
      content: [{ type: 'tool_use', id: 'tu1', name: 'create_task', input: {} }],
    });
    const anthropic = fakeAnthropicClient();

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.streamTurn(conversation, 'nog iets', user, sink);

    expect(anthropic.streamMessage).not.toHaveBeenCalled();
    expect(sink.send).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'AI_PENDING_ACTIONS' }),
    );
  });
});

describe('AiRunnerService.resumeAfterActions', () => {
  it('assembles tool_results from resolved actions and continues', async () => {
    const { prisma, usage, registry, sink } = makeDeps();
    prisma.aiMessage.findFirst.mockResolvedValue({
      id: 'm1',
      role: 'ASSISTANT',
      content: [{ type: 'tool_use', id: 'tu1', name: 'create_task', input: { title: 'X' } }],
    });
    prisma.aiPendingAction.findMany.mockResolvedValue([
      { toolUseId: 'tu1', status: 'EXECUTED', result: { output: { id: 'new-task' }, isError: false } },
    ]);
    const anthropic = fakeAnthropicClient();
    anthropic.streamMessage.mockReturnValueOnce(
      fakeStream({ content: [{ type: 'text', text: 'Gedaan' }], stop_reason: 'end_turn', usage: {} }),
    );

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.resumeAfterActions(conversation, user, sink);

    // tool_result-bericht gepersisteerd
    expect(prisma.aiMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'USER',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'tool_result', tool_use_id: 'tu1' }),
          ]),
        }),
      }),
    );
    // Lus hervat en afgerond
    expect(anthropic.streamMessage).toHaveBeenCalled();
    expect(sink.send).toHaveBeenCalledWith('done', {});
  });

  it('refuses to resume while an action is still PENDING', async () => {
    const { prisma, usage, registry, sink } = makeDeps();
    prisma.aiMessage.findFirst.mockResolvedValue({
      id: 'm1',
      role: 'ASSISTANT',
      content: [{ type: 'tool_use', id: 'tu1', name: 'create_task', input: {} }],
    });
    prisma.aiPendingAction.findMany.mockResolvedValue([{ toolUseId: 'tu1', status: 'PENDING' }]);
    const anthropic = fakeAnthropicClient();

    const runner = new AiRunnerService(anthropic, prisma, usage, registry);
    await runner.resumeAfterActions(conversation, user, sink);

    expect(anthropic.streamMessage).not.toHaveBeenCalled();
    expect(sink.send).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'AI_ACTIONS_STILL_PENDING' }),
    );
  });
});

describe('AiRunnerService — not configured', () => {
  it('reports a friendly error and stops when no key', async () => {
    const { prisma, usage, registry, sink } = makeDeps();
    const runner = new AiRunnerService(fakeAnthropicClient(false), prisma, usage, registry);
    await runner.streamTurn(conversation, 'hallo', user, sink);
    expect(runner.isConfigured).toBe(false);
    expect(usage.assertWithinQuota).not.toHaveBeenCalled();
    expect(sink.send).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
  });
});
