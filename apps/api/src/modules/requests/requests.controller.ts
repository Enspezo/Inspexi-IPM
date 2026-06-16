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
import { User } from '@prisma/client';
import { CRM_ROLES, OFFICE_ROLES } from '@/common/auth/roles';
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
  @Roles(...CRM_ROLES)
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
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Nieuwe aanvraag aanmaken' })
  @ApiResponse({ status: 201, description: 'Aanvraag aangemaakt' })
  async create(@Body() dto: CreateRequestDto, @CurrentUser() user: User) {
    const request = await this.requestsService.create(dto, user);
    return { success: true, data: request };
  }

  @Get('lost-reasons')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Lijst "reden verloren" ophalen (lookup)' })
  @ApiResponse({ status: 200, description: 'Lijst van redenen' })
  async findLostReasons(@CurrentUser() user: User) {
    const reasons = await this.requestsService.findLostReasons(user);
    return { success: true, data: reasons };
  }

  @Get(':id')
  @Roles(...CRM_ROLES)
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
  @Roles(...OFFICE_ROLES)
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
  @Roles(...OFFICE_ROLES)
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
  @Roles(...OFFICE_ROLES)
  @ApiOperation({ summary: 'Offerte aanmaken vanuit aanvraag' })
  @ApiResponse({ status: 201, description: 'Offerte aangemaakt' })
  async createQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const quote = await this.requestsService.createQuote(id, user);
    return { success: true, data: quote };
  }

  @Delete(':id')
  @Roles(...OFFICE_ROLES)
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
