import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { ALL_STAFF } from '@/common/auth/roles';
import { CurrentUser, RequiresFeature, Roles } from '@/common/decorators';
import { AiAgentAccessGuard } from './ai-agent-access.guard';
import { AiActionService } from './ai-action.service';
import { AiAgentService } from './ai-agent.service';
import { AiRunnerService, SseSink } from './ai-runner.service';
import { AiUsageService } from './ai-usage.service';
import { ConfirmActionDto, CreateConversationDto, SendMessageDto } from './dto';

/**
 * AI-assistent (add-on, PRD-12). Gate: `AI_AGENT`-feature + de effectieve
 * rollen-check in {@link AiAgentAccessGuard}. De coarse `@Roles(...ALL_STAFF)`
 * laat élke ingelogde staf-rol door de RolesGuard; de fijnmazige, per-org
 * instelbare rollencheck (default: alle staf behalve INSPECTEUR, of de
 * `aiAgentAllowedRoles`-override) gebeurt daarna in de access-guard. Zou hier
 * een strakkere set staan (bijv. CRM_ROLES), dan zou RolesGuard een INSPECTEUR
 * al 403'en vóór de guard draait — waardoor een per-org override die INSPECTEUR
 * toestaat nooit effect zou hebben. Alle endpoints zijn org- + user-gescoped.
 */
@ApiTags('AI-assistent')
@ApiBearerAuth()
@Controller('ai')
@Roles(...ALL_STAFF)
@RequiresFeature('AI_AGENT')
@UseGuards(AiAgentAccessGuard)
// Strengere limiet dan de globale 120/min: de assistent doet dure LLM-calls.
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class AiAgentController {
  constructor(
    private readonly agent: AiAgentService,
    private readonly actions: AiActionService,
    private readonly runner: AiRunnerService,
    private readonly usage: AiUsageService,
  ) {}

  /**
   * Autoritatieve toegangs-probe voor de UI: bereikt de handler alléén als álle
   * gates (feature + kill-switch + effectieve rollen-check) slagen. De frontend
   * kan zo de assistent-knop tonen zónder de rol-default-logica te dupliceren —
   * een 403 hier betekent simpelweg: geen knop.
   */
  @Get('access')
  @ApiOperation({ summary: 'Mag deze gebruiker de AI-assistent gebruiken?' })
  @ApiResponse({ status: 200, description: 'Toegang toegestaan' })
  @ApiResponse({ status: 403, description: 'Geen toegang (feature/kill-switch/rol)' })
  access() {
    return { success: true, data: { allowed: true } };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Mijn AI-gesprekken' })
  @ApiResponse({ status: 200, description: 'Lijst van gesprekken' })
  async list(@CurrentUser() user: User) {
    const data = await this.agent.listConversations(user);
    return { success: true, data };
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Nieuw AI-gesprek' })
  @ApiResponse({ status: 201, description: 'Gesprek aangemaakt' })
  async create(@CurrentUser() user: User, @Body() dto: CreateConversationDto) {
    const data = await this.agent.createConversation(user, dto);
    return { success: true, data };
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Eén gesprek met berichten' })
  @ApiResponse({ status: 200, description: 'Gesprek + berichten' })
  async getOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.agent.getConversationWithMessages(id, user);
    return { success: true, data };
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Archiveer een gesprek' })
  @ApiResponse({ status: 200, description: 'Gesprek gearchiveerd' })
  async archive(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.agent.archiveConversation(id, user);
    return { success: true, data };
  }

  /**
   * Nieuw bericht → agent-beurt, gestreamd als Server-Sent Events.
   * Events: `token` (tekst-delta), `tool` (tool-aanroep), `pending_actions`
   * (te bevestigen schrijfacties), `done`, `error`. De scoping-check (404 bij
   * niet-eigenaar) draait vóór de SSE-headers.
   */
  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Stuur een bericht (SSE-stream terug)' })
  @ApiResponse({ status: 200, description: 'SSE-stream met agent-events (token/tool/pending_actions/done/error)' })
  async sendMessage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const conversation = await this.agent.getOwnedConversation(id, user);
    await this.streamViaSse(req, res, (sink, signal) =>
      this.runner.streamTurn(conversation, dto.content, user, sink, signal),
    );
  }

  /**
   * Hervat een gepauzeerde beurt nadat de gebruiker alle voorgestelde
   * schrijfacties heeft bevestigd of afgewezen. SSE, zoals `messages`.
   */
  @Post('conversations/:id/continue')
  @ApiOperation({ summary: 'Hervat na bevestiging van acties (SSE-stream)' })
  @ApiResponse({ status: 200, description: 'SSE-stream met agent-events (token/tool/pending_actions/done/error)' })
  async continueTurn(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const conversation = await this.agent.getOwnedConversation(id, user);
    await this.streamViaSse(req, res, (sink, signal) =>
      this.runner.resumeAfterActions(conversation, user, sink, signal),
    );
  }

  @Post('actions/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bevestig en voer een voorgestelde schrijfactie uit' })
  @ApiResponse({ status: 200, description: 'Actie uitgevoerd (of mislukt)' })
  async confirmAction(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmActionDto,
    @Ip() ip: string,
  ) {
    const data = await this.actions.confirm(id, user, ip, dto.args);
    return { success: true, data };
  }

  @Post('actions/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Wijs een voorgestelde schrijfactie af' })
  @ApiResponse({ status: 200, description: 'Actie afgewezen' })
  async rejectAction(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.actions.reject(id, user);
    return { success: true, data };
  }

  @Get('usage')
  @ApiOperation({ summary: 'AI-verbruik van mijn organisatie (deze maand)' })
  @ApiResponse({ status: 200, description: 'Verbruikssamenvatting' })
  async getUsage(@CurrentUser() user: User) {
    const orgId = this.agent.requireOrg(user);
    const data = await this.usage.summary(orgId);
    return { success: true, data };
  }

  /**
   * Zet SSE-headers en draait `work` met een sink die naar de response schrijft.
   * Bij een client-disconnect (browser sluit tab / navigeert weg) wordt de
   * meegegeven `AbortSignal` getriggerd zodat de runner de lopende Anthropic-
   * stream afbreekt i.p.v. door te betalen voor tokens die niemand meer leest.
   */
  private async streamViaSse(
    req: Request,
    res: Response,
    work: (sink: SseSink, signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Schakel buffering van reverse proxies (nginx) uit → events komen direct door.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abort = new AbortController();
    let closed = false;
    const onClose = () => abort.abort();
    req.on('close', onClose);

    const sink: SseSink = {
      send: (event, data) => {
        if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      },
      close: () => {
        if (!closed) {
          closed = true;
          res.end();
        }
      },
    };

    try {
      await work(sink, abort.signal);
    } finally {
      req.off('close', onClose);
    }
  }
}
