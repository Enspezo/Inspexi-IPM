import { HttpException } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';

function makePrisma(sum: any = {}) {
  return {
    aiUsageLog: {
      aggregate: jest.fn().mockResolvedValue({ _sum: sum }),
      create: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

const config = (quota?: string) =>
  ({ get: (_k: string, d: string) => quota ?? d }) as any;

describe('AiUsageService', () => {
  it('sums input + cached + output tokens for the month', async () => {
    const prisma = makePrisma({
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
    });
    const svc = new AiUsageService(prisma, config());
    await expect(svc.monthlyTokens('orgA')).resolves.toBe(170);
  });

  it('throws 429 when the monthly quota is reached', async () => {
    const prisma = makePrisma({ inputTokens: 500, outputTokens: 0 });
    const svc = new AiUsageService(prisma, config('400'));
    await expect(svc.assertWithinQuota('orgA')).rejects.toMatchObject({
      status: 429,
    });
    await expect(svc.assertWithinQuota('orgA')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('passes when under quota', async () => {
    const prisma = makePrisma({ inputTokens: 100, outputTokens: 100 });
    const svc = new AiUsageService(prisma, config('1000'));
    await expect(svc.assertWithinQuota('orgA')).resolves.toBeUndefined();
  });

  it('computes cost in cents by model price (Sonnet 5)', () => {
    const svc = new AiUsageService(makePrisma(), config());
    // 1M input @ 300c + 1M output @ 1500c = 1800c
    const cents = svc.costCents('claude-sonnet-5', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cents).toBe(1800);
  });

  it('records a usage row with derived cost', async () => {
    const prisma = makePrisma();
    const svc = new AiUsageService(prisma, config());
    await svc.record({
      orgId: 'orgA',
      userId: 'u1',
      conversationId: 'c1',
      model: 'claude-opus-4-8',
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });
    expect(prisma.aiUsageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'orgA',
          model: 'claude-opus-4-8',
          inputTokens: 1_000_000,
          costCents: 500, // 1M input @ Opus 500c/MTok
        }),
      }),
    );
  });
});
