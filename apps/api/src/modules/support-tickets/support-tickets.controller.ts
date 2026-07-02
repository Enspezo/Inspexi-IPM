import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { SupportTicketsService } from './support-tickets.service';
import {
  CreateSupportTicketDto,
  AddTicketMessageDto,
  UpdateSupportTicketDto,
  ListSupportTicketsDto,
} from './dto';

@ApiTags('Support tickets')
@ApiBearerAuth()
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private tickets: SupportTicketsService) {}

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({
    summary: 'Tickets (mine/org; SUPERUSER = wachtrij over alle orgs)',
  })
  async findAll(@CurrentUser() user: User, @Query() q: ListSupportTicketsDto) {
    return { success: true, data: await this.tickets.findAll(user, q) };
  }

  // Specifieke route vóór de generieke :id-route, anders parset Nest "stats" als id.
  @Get('stats')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Aantallen per status (binnen de eigen scope)' })
  async stats(@CurrentUser() user: User) {
    return { success: true, data: await this.tickets.stats(user) };
  }

  @Post()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Nieuw ticket aanmaken' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return { success: true, data: await this.tickets.create(user, dto) };
  }

  @Get(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Ticketdetail incl. berichten-thread' })
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.tickets.findOne(user, id) };
  }

  @Post(':id/messages')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Reactie of interne notitie toevoegen' })
  async addMessage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTicketMessageDto,
  ) {
    return { success: true, data: await this.tickets.addMessage(user, id, dto) };
  }

  // De service dwingt af: muteren mag alleen door ORG_ADMIN (eigen org) of SUPERUSER.
  @Patch(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Status/prioriteit/toewijzing bijwerken' })
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    return { success: true, data: await this.tickets.update(user, id, dto) };
  }
}
