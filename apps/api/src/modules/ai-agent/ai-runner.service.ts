import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  AiActionStatus,
  AiConversation,
  AiMessageRole,
  User,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AI_AGENT_DEFAULT_EFFORT,
  AI_MAX_ITERATIONS,
  AI_MAX_TOKENS,
  AI_SYSTEM_PROMPT,
} from './ai-config';
import { AnthropicClientService } from '@/common/services/anthropic/anthropic-client.service';
import { AiUsageService } from './ai-usage.service';
import { AiToolRegistry } from './tools/tool-registry';

/** Minimale SSE-uitgang, ontkoppeld van Express zodat de runner testbaar is. */
export interface SseSink {
  send(event: string, data: unknown): void;
  close(): void;
}

/** Web-search draait server-side bij Anthropic (PRD-15 §5.5). */
const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 5,
};

/** Genormaliseerd tool-resultaat zoals opgeslagen op AiPendingAction.result. */
interface StoredToolResult {
  output: unknown;
  isError: boolean;
}

/**
 * Draait de agent-beurt en beheert het bevestig-en-hervat-pad (PRD-15 §5.3–5.4).
 * Lees-tools draaien direct; zodra een beurt één of meer WRITE-tools bevat wordt
 * de beurt gepauzeerd: leesresultaten worden alvast bewaard, write-tools worden
 * `AiPendingAction`s (PENDING), en de gebruiker bevestigt ze los. Na bevestiging
 * hervat `resumeAfterActions` de lus met de samengestelde tool_results.
 */
@Injectable()
export class AiRunnerService {
  private readonly logger = new Logger(AiRunnerService.name);

  constructor(
    // Gedeelde client (PRD-13-conventie): dezelfde AnthropicClientService als
    // voice en ai-review; zonder ANTHROPIC_API_KEY meldt de assistent netjes
    // dat hij niet geconfigureerd is.
    private readonly anthropic: AnthropicClientService,
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageService,
    private readonly registry: AiToolRegistry,
  ) {}

  get isConfigured(): boolean {
    return this.anthropic.isAvailable();
  }

  /** Nieuw gebruikersbericht → start een beurt en stream het antwoord. */
  async streamTurn(
    conversation: AiConversation,
    userText: string,
    user: User,
    sink: SseSink,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!(await this.guard(conversation, sink))) return;

    // Blokkeer een nieuw bericht zolang er een openstaande (nog te bevestigen)
    // beurt is — Anthropic vereist eerst tool_results voor alle tool_use-blokken.
    if (await this.hasOpenToolUse(conversation.id)) {
      sink.send('error', {
        message:
          'Er staan nog acties open. Bevestig of wijs ze eerst af en hervat het gesprek.',
        code: 'AI_PENDING_ACTIONS',
      });
      sink.close();
      return;
    }

    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        orgId: conversation.orgId,
        role: AiMessageRole.USER,
        content: [{ type: 'text', text: userText }] as any,
      },
    });

    await this.runLoop(conversation, user, sink, userText, signal);
  }

  /**
   * Hervat na bevestiging/afwijzing: stelt de tool_results samen uit de
   * afgehandelde acties van de gepauzeerde beurt en zet de lus voort.
   */
  async resumeAfterActions(
    conversation: AiConversation,
    user: User,
    sink: SseSink,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!(await this.guard(conversation, sink))) return;

    const last = await this.prisma.aiMessage.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
    });
    const toolUseIds =
      last?.role === AiMessageRole.ASSISTANT
        ? (last.content as any[])
            .filter((b) => b?.type === 'tool_use')
            .map((b) => b.id as string)
        : [];
    if (!last || toolUseIds.length === 0) {
      sink.send('error', { message: 'Geen openstaande beurt om te hervatten' });
      sink.close();
      return;
    }

    const actions = await this.prisma.aiPendingAction.findMany({
      where: { conversationId: conversation.id, messageId: last.id },
    });
    if (actions.some((a) => a.status === AiActionStatus.PENDING)) {
      sink.send('error', {
        message: 'Nog niet alle acties zijn bevestigd of afgewezen',
        code: 'AI_ACTIONS_STILL_PENDING',
      });
      sink.close();
      return;
    }

    const byToolUse = new Map(actions.map((a) => [a.toolUseId, a]));
    const results: Anthropic.ToolResultBlockParam[] = toolUseIds.map((id) => {
      const stored = (byToolUse.get(id)?.result as unknown as StoredToolResult) ?? {
        output: null,
        isError: false,
      };
      return {
        type: 'tool_result',
        tool_use_id: id,
        content:
          typeof stored.output === 'string'
            ? stored.output
            : JSON.stringify(stored.output ?? null),
        is_error: stored.isError === true,
      };
    });

    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        orgId: conversation.orgId,
        role: AiMessageRole.USER,
        content: results as any,
      },
    });

    await this.runLoop(conversation, user, sink, undefined, signal);
  }

  // ─── Interne lus ───────────────────────────────────────

  private async guard(
    conversation: AiConversation,
    sink: SseSink,
  ): Promise<boolean> {
    if (!this.anthropic.isAvailable()) {
      sink.send('error', { message: 'De AI-assistent is niet geconfigureerd' });
      sink.close();
      return false;
    }
    try {
      await this.usage.assertWithinQuota(conversation.orgId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sink.send('error', { message, code: 'AI_QUOTA_EXCEEDED' });
      sink.close();
      return false;
    }
    return true;
  }

  /** Is er een assistent-beurt met tool_use-blokken zonder tool_results? */
  private async hasOpenToolUse(conversationId: string): Promise<boolean> {
    const last = await this.prisma.aiMessage.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    return (
      last?.role === AiMessageRole.ASSISTANT &&
      (last.content as any[]).some((b) => b?.type === 'tool_use')
    );
  }

  private async runLoop(
    conversation: AiConversation,
    user: User,
    sink: SseSink,
    firstUserText?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const history = await this.prisma.aiMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
      });
      const messages: Anthropic.MessageParam[] = history.map((m) => ({
        role: m.role === AiMessageRole.ASSISTANT ? 'assistant' : 'user',
        content: m.content as any,
      }));

      const clientTools = this.registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
      const tools: any[] = [...clientTools, WEB_SEARCH_TOOL];
      const model = conversation.model;

      let hitIterationLimit = true;
      for (let iter = 0; iter < AI_MAX_ITERATIONS; iter++) {
        if (signal?.aborted) return; // client is weg → stop stil, geen error-event
        const stream = this.anthropic.streamMessage(
          {
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
            output_config: { effort: AI_AGENT_DEFAULT_EFFORT } as any,
            tools,
            messages,
          },
          // Expliciete timeout/retries (voorheen op de losse client-instantie):
          // elke agent-beurt houdt een SSE-verbinding open die anders bij een
          // hangende upstream-call een request lang blokkeert.
          { signal, timeout: 120_000, maxRetries: 2 },
        );
        stream.on('text', (delta: string) => sink.send('token', { text: delta }));

        const final = await stream.finalMessage();

        this.usage
          .record({
            orgId: conversation.orgId,
            userId: user.id,
            conversationId: conversation.id,
            model,
            usage: final.usage,
          })
          .catch((err) => this.logger.error(`AI usage log error: ${err}`));

        const assistantMsg = await this.prisma.aiMessage.create({
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
          const hasWrite = toolUses.some(
            (tu) => this.registry.get(tu.name)?.mutates,
          );

          if (hasWrite) {
            await this.haltForConfirmation(
              conversation,
              user,
              assistantMsg.id,
              toolUses,
              sink,
            );
            await this.touch(conversation, firstUserText);
            sink.send('done', { paused: true });
            sink.close();
            return;
          }

          // Alleen lees-tools → direct uitvoeren en doorlopen.
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const stored = await this.execTool(tu, user, sink);
            results.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content:
                typeof stored.output === 'string'
                  ? stored.output
                  : JSON.stringify(stored.output ?? null),
              is_error: stored.isError,
            });
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
          // Server-tool bereikte de iteratie-limiet: hervat.
          continue;
        }

        // end_turn / max_tokens / stop_sequence / refusal → klaar.
        hitIterationLimit = false;
        break;
      }

      await this.touch(conversation, firstUserText);
      // `truncated` = de lus stopte op AI_MAX_ITERATIONS terwijl er nog tool-werk was.
      sink.send('done', hitIterationLimit ? { truncated: true } : {});
      sink.close();
    } catch (err) {
      // Client-disconnect: de stream is bewust afgebroken → geen error naar de
      // (verdwenen) client, gewoon stil stoppen.
      if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
        return;
      }
      // WP-C1: dit pad loopt búiten de exception-filter om (SSE-headers zijn al
      // verstuurd) — stuur dus zelf een nette NL-melding en houd de technische
      // details (Engelse SDK-/API-fouten) in de serverlog.
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI turn error: ${detail}`);
      sink.send('error', {
        message: 'Er ging iets mis bij de AI-assistent. Probeer het opnieuw.',
      });
      sink.close();
    }
  }

  /**
   * Pauzeer voor bevestiging: lees-tools nu uitvoeren (EXECUTED), write-tools als
   * PENDING wegschrijven. Alle tool_uses van deze beurt krijgen een actie-rij
   * zodat `resumeAfterActions` later de volledige tool_result-set kan opbouwen.
   */
  private async haltForConfirmation(
    conversation: AiConversation,
    user: User,
    messageId: string,
    toolUses: Anthropic.ToolUseBlock[],
    sink: SseSink,
  ): Promise<void> {
    const cards: Array<{
      id: string;
      toolName: string;
      summary: string;
      args: unknown;
    }> = [];

    for (const tu of toolUses) {
      const def = this.registry.get(tu.name);

      if (def && def.mutates) {
        const summary = def.summarize?.(tu.input as any) ?? `Actie: ${tu.name}`;
        const action = await this.prisma.aiPendingAction.create({
          data: {
            conversationId: conversation.id,
            messageId,
            orgId: conversation.orgId,
            userId: user.id,
            toolName: tu.name,
            toolUseId: tu.id,
            args: (tu.input ?? {}) as any,
            summary,
            status: AiActionStatus.PENDING,
          },
        });
        cards.push({ id: action.id, toolName: tu.name, summary, args: tu.input });
        continue;
      }

      // Lees-tool (of onbekend) → nu uitvoeren en als EXECUTED bewaren.
      const stored = await this.execTool(tu, user, sink);
      await this.prisma.aiPendingAction.create({
        data: {
          conversationId: conversation.id,
          messageId,
          orgId: conversation.orgId,
          userId: user.id,
          toolName: tu.name,
          toolUseId: tu.id,
          args: (tu.input ?? {}) as any,
          summary: `Opgevraagd: ${tu.name}`,
          status: AiActionStatus.EXECUTED,
          result: stored as any,
        },
      });
    }

    sink.send('pending_actions', { actions: cards });
  }

  /** Voer een (lees-)tool uit; vang fouten als tool_result met isError. */
  private async execTool(
    tu: Anthropic.ToolUseBlock,
    user: User,
    sink: SseSink,
  ): Promise<StoredToolResult> {
    const def = this.registry.get(tu.name);
    sink.send('tool', { name: tu.name });
    if (!def) {
      return { output: `Onbekende tool: ${tu.name}`, isError: true };
    }
    try {
      const out = await def.run({ user }, tu.input as Record<string, any>);
      return { output: out ?? null, isError: false };
    } catch (err) {
      return {
        output: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  }

  private async touch(
    conversation: AiConversation,
    firstUserText?: string,
  ): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: new Date(),
        ...(conversation.title || !firstUserText
          ? {}
          : { title: firstUserText.slice(0, 60).trim() || 'Nieuw gesprek' }),
      },
    });
  }
}
