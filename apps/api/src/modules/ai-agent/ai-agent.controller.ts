import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { CRM_ROLES } from '@/common/auth/roles';
import { CurrentUser, RequiresFeature, Roles } from '@/common/decorators';
import { AiAgentService } from './ai-agent.service';
import { AiRunnerService, SseSink } from './ai-runner.service';
import { AiUsageService } from './ai-usage.service';
import { CreateConversationDto, SendMessageDto } from './dto';

/**
 * AI-assistent (add-on, PRD-12). Gate: `AI_AGENT`-feature + de default toegestane
 * rollen (alle staf behalve INSPECTEUR); fijnmazige per-org rol-instelling volgt
 * in fase 4. Alle endpoints zijn org- + user-gescoped (privé gesprekken).
 */
@ApiTags('AI-assistent')
@ApiBearerAuth()
@Controller('ai')
@Roles(...CRM_ROLES)
@RequiresFeature('AI_AGENT')
export class AiAgentController {
  constructor(
    private readonly agent: AiAgentService,
    private readonly runner: AiRunnerService,
    private readonly usage: AiUsageService,
  ) {}

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
   * Events: `token` (tekst-delta), `tool` (tool-aanroep), `done`, `error`.
   * De scoping-check (404 bij niet-eigenaar) draait vóór de SSE-headers.
   */
  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Stuur een bericht (SSE-stream terug)' })
  async sendMessage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    const conversation = await this.agent.getOwnedConversation(id, user);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
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

    await this.runner.streamTurn(conversation, dto.content, user, sink);
  }

  @Get('usage')
  @ApiOperation({ summary: 'AI-verbruik van mijn organisatie (deze maand)' })
  @ApiResponse({ status: 200, description: 'Verbruikssamenvatting' })
  async getUsage(@CurrentUser() user: User) {
    const orgId = this.agent.requireOrg(user);
    const data = await this.usage.summary(orgId);
    return { success: true, data };
  }
}
