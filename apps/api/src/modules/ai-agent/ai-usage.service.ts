import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import {
  DEFAULT_MONTHLY_TOKEN_QUOTA,
  FALLBACK_PRICE,
  MODEL_PRICING,
} from './ai-config';

/** Anthropic `usage`-vorm die we meten (subset). */
export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Metering + fair-use-quota voor de AI-assistent (PRD-12 §7.5). Vast maandbedrag
 * per org; het token-plafond is een misbruik-grens, geen doorbelasting.
 */
@Injectable()
export class AiUsageService {
  private readonly monthlyQuota: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = config.get<string>(
      'AI_AGENT_MONTHLY_TOKEN_QUOTA',
      String(DEFAULT_MONTHLY_TOKEN_QUOTA),
    );
    const parsed = parseInt(raw, 10);
    this.monthlyQuota =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_TOKEN_QUOTA;
  }

  private startOfMonth(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  /**
   * Totaal verbruikte tokens (input + cache-read + cache-write + output) deze
   * maand voor de org. Cache-creation telt mee: het zijn echte, betaalde tokens.
   */
  async monthlyTokens(orgId: string): Promise<number> {
    const agg = await this.prisma.aiUsageLog.aggregate({
      _sum: {
        inputTokens: true,
        cachedInputTokens: true,
        cacheCreationTokens: true,
        outputTokens: true,
      },
      where: { orgId, createdAt: { gte: this.startOfMonth() } },
    });
    return (
      (agg._sum.inputTokens ?? 0) +
      (agg._sum.cachedInputTokens ?? 0) +
      (agg._sum.cacheCreationTokens ?? 0) +
      (agg._sum.outputTokens ?? 0)
    );
  }

  /** Gooit 429 als het maand-plafond is bereikt. Aanroepen vóór elke beurt. */
  async assertWithinQuota(orgId: string): Promise<void> {
    const used = await this.monthlyTokens(orgId);
    if (used >= this.monthlyQuota) {
      throw new HttpException(
        {
          success: false,
          message: 'Het AI-tegoed voor deze maand is bereikt',
          code: 'AI_QUOTA_EXCEEDED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Bereken de geschatte kostprijs in eurocent voor één call. */
  costCents(model: string, usage: AnthropicUsage): number {
    const price = MODEL_PRICING[model] ?? FALLBACK_PRICE;
    const input = usage.input_tokens ?? 0;
    const cached = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    return Math.round(
      (input / 1_000_000) * price.inputCentsPerMTok +
        // cache-reads ~0,1× input-tarief
        (cached / 1_000_000) * price.inputCentsPerMTok * 0.1 +
        // cache-writes ~1,25× input-tarief (5-min TTL)
        (cacheWrite / 1_000_000) * price.inputCentsPerMTok * 1.25 +
        (output / 1_000_000) * price.outputCentsPerMTok,
    );
  }

  /** Schrijf één verbruiksregel weg (fire-and-forget vanuit de runner). */
  async record(params: {
    orgId: string;
    userId: string;
    conversationId: string | null;
    model: string;
    usage: AnthropicUsage;
  }): Promise<void> {
    const { orgId, userId, conversationId, model, usage } = params;
    await this.prisma.aiUsageLog.create({
      data: {
        orgId,
        userId,
        conversationId,
        model,
        inputTokens: usage.input_tokens ?? 0,
        cachedInputTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        costCents: this.costCents(model, usage),
      },
    });
  }

  /** Samenvatting voor het tegoed-widget. */
  async summary(orgId: string): Promise<{
    monthTokens: number;
    monthlyQuota: number;
    remaining: number;
  }> {
    const monthTokens = await this.monthlyTokens(orgId);
    return {
      monthTokens,
      monthlyQuota: this.monthlyQuota,
      remaining: Math.max(0, this.monthlyQuota - monthTokens),
    };
  }
}
