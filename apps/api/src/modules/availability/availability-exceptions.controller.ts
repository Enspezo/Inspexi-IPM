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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { AvailabilityExceptionsService } from './availability-exceptions.service';
import {
  CreateAvailabilityExceptionDto,
  UpdateAvailabilityExceptionDto,
  ListAvailabilityExceptionsQueryDto,
} from './dto';

/**
 * Uitzonderingen — beheerd door de inspecteur zelf (eigen) én MANAGEMENT_ROLES
 * (iedereen binnen de org). De fijnmazige autorisatie zit in de service.
 */
@ApiTags('Availability exceptions')
@ApiBearerAuth()
@Roles(...ALL_STAFF)
@Controller('availability/exceptions')
export class AvailabilityExceptionsController {
  constructor(private readonly service: AvailabilityExceptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Uitzonderingen opvragen (eigen, of andermans voor management)' })
  @ApiResponse({ status: 200, description: 'Lijst uitzonderingen' })
  async findAll(
    @Query() query: ListAvailabilityExceptionsQueryDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Uitzondering aanmaken (eenmalig of herhalend)' })
  @ApiResponse({ status: 201, description: 'Uitzondering aangemaakt' })
  async create(
    @Body() dto: CreateAvailabilityExceptionDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.create(user, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Uitzondering bijwerken' })
  @ApiResponse({ status: 200, description: 'Uitzondering bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvailabilityExceptionDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.update(id, user, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Uitzondering verwijderen (soft-delete)' })
  @ApiResponse({ status: 200, description: 'Uitzondering verwijderd' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.service.remove(id, user);
    return { success: true, message: 'Uitzondering verwijderd' };
  }
}
