import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

/** DI-token voor de (mogelijk afwezige) Anthropic-client. */
export const AI_ANTHROPIC = Symbol('AI_ANTHROPIC');

/**
 * Levert een gedeelde Anthropic-client uit `ANTHROPIC_API_KEY` (centrale
 * beheerde key, PRD-12 §3). Zonder key → `null`: de assistent meldt dan netjes
 * dat hij niet is geconfigureerd (zoals de `voice`-module). Als aparte provider
 * zodat tests hem eenvoudig kunnen mocken.
 */
export const AiAnthropicProvider: Provider = {
  provide: AI_ANTHROPIC,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Anthropic | null => {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    return apiKey ? new Anthropic({ apiKey }) : null;
  },
};
