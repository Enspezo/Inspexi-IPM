// Gedeelde Anthropic-client (PRD-13 §13.6.1). Eén plek voor client-init en de
// ANTHROPIC_API_KEY-beschikbaarheidscheck; de modelkeuze blijft per aanroeper
// (voice → ANTHROPIC_MODEL, ai-review → ANTHROPIC_REVIEW_MODEL, ai-agent →
// ANTHROPIC_AGENT_MODEL). De latere help-chatbot (PRD-10 fase 6) gebruikt
// dezelfde service.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

/** Gedeelde model-default voor alle AI-functies (geen hardcoded versies elders). */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

/** Per-aanroep opties (doorgegeven aan de SDK-request). */
export interface AnthropicRequestOptions {
  /** Request-timeout in ms. */
  timeout?: number;
  /** Aantal retries bij transient errors (SDK-default is 2). */
  maxRetries?: number;
}

@Injectable()
export class AnthropicClientService {
  private readonly logger = new Logger(AnthropicClientService.name);
  private client?: Anthropic;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.configured = !!apiKey;
    if (this.configured) this.client = new Anthropic({ apiKey });
    else
      this.logger.warn(
        'ANTHROPIC_API_KEY niet gezet — AI-functies (voice-parsing, AI-review) uitgeschakeld',
      );
  }

  isAvailable(): boolean {
    return this.configured;
  }

  /**
   * Doorgeefluik naar `messages.create` — het model gaat per aanroep mee in de
   * params. Gooit wanneer de client niet geconfigureerd is; aanroepers horen
   * eerst {@link isAvailable} te checken (graceful degradation).
   */
  async createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: AnthropicRequestOptions,
  ): Promise<Anthropic.Message> {
    if (!this.client) {
      throw new Error('Anthropic-client niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt)');
    }
    // Zonder opties de éénargument-vorm gebruiken (houdt bestaande call-verwachtingen stabiel).
    return options ? this.client.messages.create(params, options) : this.client.messages.create(params);
  }

  /**
   * Doorgeefluik naar `messages.stream` voor streamende aanroepers (ai-agent).
   * Zelfde contract als {@link createMessage}: gooit zonder geconfigureerde
   * client; check eerst {@link isAvailable}. De opties (o.a. `signal` voor
   * client-disconnect-aborts, `timeout`, `maxRetries`) gaan 1-op-1 door naar de
   * SDK. Parametertypes volgen de SDK-signatuur zodat een SDK-upgrade hier geen
   * handmatige type-sync vereist.
   */
  streamMessage(
    params: Parameters<Anthropic['messages']['stream']>[0],
    options?: Parameters<Anthropic['messages']['stream']>[1],
  ): ReturnType<Anthropic['messages']['stream']> {
    if (!this.client) {
      throw new Error('Anthropic-client niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt)');
    }
    return this.client.messages.stream(params, options);
  }
}
