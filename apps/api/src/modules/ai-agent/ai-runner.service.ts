import { Inject, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiConversation, AiMessageRole, User } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AI_MAX_ITERATIONS,
  AI_MAX_TOKENS,
  AI_SYSTEM_PROMPT,
} from './ai-config';
import { AI_ANTHROPIC } from './ai-anthropic.provider';
import { AiUsageService } from './ai-usage.service';
import { AiToolRegistry } from './tools/tool-registry';

/** Minimale SSE-uitgang, ontkoppeld van Express zodat de runner testbaar is. */
export interface SseSink {
  send(event: string, data: unknown): void;
  close(): void;
}

/** Web-search draait server-side bij Anthropic (PRD-12 §5.5). */
const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 5,
};

/**
 * Draait één gebruikersbeurt: streamt het antwoord, voert lees-tools uit en
 * lust door tot de assistent klaar is. Fase 2 kent alleen lees-tools; er is dus
 * (nog) geen bevestig-en-hervat-pad voor schrijfacties (dat komt in fase 3).
 */
@Injectable()
export class AiRunnerService {
  private readonly logger = new Logger(AiRunnerService.name);

  constructor(
    @Inject(AI_ANTHROPIC) private readonly anthropic: Anthropic | null,
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageService,
    private readonly registry: AiToolRegistry,
  ) {}

  get isConfigured(): boolean {
    return this.anthropic !== null;
  }

  async streamTurn(
    conversation: AiConversation,
    userText: string,
    user: User,
    sink: SseSink,
  ): Promise<void> {
    if (!this.anthropic) {
      sink.send('error', { message: 'De AI-assistent is niet geconfigureerd' });
      sink.close();
      return;
    }

    try {
      await this.usage.assertWithinQuota(conversation.orgId);

      // 1) Persisteer het gebruikersbericht.
      await this.prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          orgId: conversation.orgId,
          role: AiMessageRole.USER,
          content: [{ type: 'text', text: userText }] as any,
        },
      });

      // 2) Bouw de berichten-historie voor de API.
      const history = await this.prisma.aiMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
      });
      const messages: Anthropic.MessageParam[] = history.map((m) => ({
        role: m.role === AiMessageRole.ASSISTANT ? 'assistant' : 'user',
        content: m.content as any,
      }));

      // 3) Tools: client-lees-tools + server-side web-search.
      const clientTools = this.registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
      const tools: any[] = [...clientTools, WEB_SEARCH_TOOL];

      const model = conversation.model;

      // 4) Agent-loop.
      for (let iter = 0; iter < AI_MAX_ITERATIONS; iter++) {
        const stream = this.anthropic.messages.stream({
          model,
          max_tokens: AI_MAX_TOKENS,
          system: [
            {
              type: 'text',
              text: AI_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          thinking: { type: 'adaptive' } as any,
          tools,
          messages,
        });

        // Stream tekst-deltas naar de client.
        stream.on('text', (delta: string) => sink.send('token', { text: delta }));

        const final = await stream.finalMessage();

        // Metering (mag de beurt nooit breken).
        this.usage
          .record({
            orgId: conversation.orgId,
            userId: user.id,
            conversationId: conversation.id,
            model,
            usage: final.usage,
          })
          .catch((err) => this.logger.error(`AI usage log error: ${err}`));

        // Persisteer het assistent-bericht (alle content-blokken).
        await this.prisma.aiMessage.create({
          data: {
            conversationId: conversation.id,
            orgId: conversation.orgId,
            role: AiMessageRole.ASSISTANT,
            content: final.content as any,
          },
        });
        messages.push({ role: 'assistant', content: final.content });

        if (final.stop_reason === 'tool_use') {
          const toolUses = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          );
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const def = this.registry.get(tu.name);
            sink.send('tool', { name: tu.name });
            if (!def) {
              results.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: `Onbekende tool: ${tu.name}`,
                is_error: true,
              });
              continue;
            }
            try {
              const out = await def.run({ user }, tu.input as Record<string, any>);
              results.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: JSON.stringify(out ?? null),
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              results.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: message,
                is_error: true,
              });
            }
          }

          await this.prisma.aiMessage.create({
            data: {
              conversationId: conversation.id,
              orgId: conversation.orgId,
              role: AiMessageRole.USER,
              content: results as any,
            },
          });
          messages.push({ role: 'user', content: results });
          continue;
        }

        if (final.stop_reason === 'pause_turn') {
          // Server-tool (web-search) bereikte de iteratie-limiet: hervat.
          continue;
        }

        // end_turn / max_tokens / stop_sequence / refusal → klaar.
        break;
      }

      // 5) Touch + eerste titel afleiden.
      await this.prisma.aiConversation.update({
        where: { id: conversation.id },
        data: {
          updatedAt: new Date(),
          ...(conversation.title
            ? {}
            : { title: userText.slice(0, 60).trim() || 'Nieuw gesprek' }),
        },
      });

      sink.send('done', {});
      sink.close();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI turn error: ${message}`);
      sink.send('error', { message });
      sink.close();
    }
  }
}
