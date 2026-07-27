import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { CurrentUser, Roles } from '@/common/decorators';
import { ChatService } from './chat.service';
import { ChatThreadsService } from './chat-threads.service';
import { ChatTranscriptsService } from './chat-transcripts.service';
import {
  CreateThreadDto,
  ListMessagesQueryDto,
  SearchChatUsersQueryDto,
  SendMessageDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@Roles(...ALL_STAFF)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly threads: ChatThreadsService,
    private readonly transcripts: ChatTranscriptsService,
  ) {}

  // ─── Threads ──────────────────────────────────────────
  @Get('threads')
  @ApiOperation({ summary: 'Mijn chats (1-op-1 + team) met ongelezen-tellingen' })
  @ApiResponse({ status: 200, description: 'Lijst van chats' })
  async listThreads(@CurrentUser() user: User) {
    const data = await this.threads.listThreads(user);
    return { success: true, data };
  }

  @Post('threads')
  @ApiOperation({ summary: 'Start (of hergebruik) een 1-op-1 of team-chat' })
  @ApiResponse({ status: 201, description: 'Chat aangemaakt of hergebruikt' })
  async createThread(@CurrentUser() user: User, @Body() dto: CreateThreadDto) {
    const data = await this.threads.createThread(user, dto);
    return { success: true, data };
  }

  // ─── Lichte poll-endpoints ────────────────────────────
  @Get('unread')
  @ApiOperation({ summary: 'Totaal ongelezen chatberichten (badge-teller)' })
  @ApiResponse({ status: 200, description: '{ count }' })
  async getUnread(@CurrentUser() user: User) {
    const data = await this.threads.getUnread(user);
    return { success: true, data };
  }

  // ─── Gebruikerszoek (voor @-mentions en starten 1-op-1) ──
  @Get('users')
  @ApiOperation({ summary: 'Org-gebruikers zoeken voor @-mentions / 1-op-1 chat' })
  @ApiResponse({ status: 200, description: 'Lijst van gebruikers (met presence)' })
  async searchUsers(@CurrentUser() user: User, @Query() query: SearchChatUsersQueryDto) {
    const data = await this.threads.searchUsers(user, query);
    return { success: true, data };
  }

  // ─── Single thread ────────────────────────────────────
  @Get('threads/:id')
  @ApiOperation({ summary: 'Eén chat ophalen' })
  @ApiResponse({ status: 200, description: 'Chat' })
  async getThread(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    const data = await this.chat.getThread(id, user);
    return { success: true, data };
  }

  @Get('threads/:id/messages')
  @ApiOperation({ summary: 'Berichten van een chat ophalen (poll met ?since=)' })
  @ApiResponse({ status: 200, description: 'Berichten' })
  async listMessages(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Query() query: ListMessagesQueryDto,
  ) {
    const data = await this.chat.listMessages(id, user, query);
    return { success: true, data };
  }

  @Post('threads/:id/messages')
  @ApiOperation({ summary: 'Bericht plaatsen (incl. @-mentions en record-referentie)' })
  @ApiResponse({ status: 201, description: 'Bericht geplaatst' })
  async sendMessage(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.chat.sendMessage(id, user, dto);
    return { success: true, data };
  }

  @Post('threads/:id/read')
  @ApiOperation({ summary: 'Chat als gelezen markeren' })
  @ApiResponse({ status: 201, description: 'Gelezen-status bijgewerkt' })
  async markRead(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    const data = await this.threads.markRead(id, user);
    return { success: true, data };
  }

  @Post('threads/:id/close')
  @ApiOperation({ summary: 'Chat afronden (transcript-notitie bij gekoppeld record)' })
  @ApiResponse({ status: 201, description: 'Chat afgerond' })
  async closeThread(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    const data = await this.transcripts.closeThread(id, user);
    return { success: true, data };
  }
}
