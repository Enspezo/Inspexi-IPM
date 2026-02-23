import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { RequestsService } from './requests.service';
import {
  CreateRequestDto,
  UpdateRequestDto,
  UpdateRequestStatusDto,
  ListRequestsQueryDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  @Get()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Aanvragen ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst aanvragen' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListRequestsQueryDto,
  ) {
    const result = await this.requestsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Nieuwe aanvraag aanmaken' })
  @ApiResponse({ status: 201, description: 'Aanvraag aangemaakt' })
  async create(@Body() dto: CreateRequestDto, @CurrentUser() user: User) {
    const request = await this.requestsService.create(dto, user);
    return { success: true, data: request };
  }

  @Get(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Aanvraag detail ophalen' })
  @ApiResponse({ status: 200, description: 'Aanvraag details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const request = await this.requestsService.findOne(id, user);
    return { success: true, data: request };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Aanvraag bijwerken' })
  @ApiResponse({ status: 200, description: 'Aanvraag bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: User,
  ) {
    const request = await this.requestsService.update(id, dto, user);
    return { success: true, data: request };
  }

  @Patch(':id/status')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Aanvraag status wijzigen' })
  @ApiResponse({ status: 200, description: 'Status bijgewerkt' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() user: User,
  ) {
    const request = await this.requestsService.updateStatus(id, dto, user);
    return { success: true, data: request };
  }

  @Post(':id/quote')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Offerte aanmaken vanuit aanvraag (stub)' })
  @ApiResponse({ status: 501, description: 'Nog niet geïmplementeerd' })
  async createQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.requestsService.createQuote(id, user);
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE)
  @ApiOperation({ summary: 'Aanvraag verwijderen (soft delete)' })
  @ApiResponse({ status: 200, description: 'Aanvraag verwijderd' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.requestsService.softDelete(id, user);
    return { success: true, message: 'Aanvraag verwijderd' };
  }
}
