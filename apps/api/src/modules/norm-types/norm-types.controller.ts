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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { NormTypesService } from './norm-types.service';
import { CreateNormTypeDto, UpdateNormTypeDto } from './dto';

const READ_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
] as const;
const WRITE_ROLES = [Role.SUPERUSER] as const;

@ApiTags('norm-types')
@ApiBearerAuth()
@Controller('norm-types')
export class NormTypesController {
  constructor(private readonly service: NormTypesService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Normtypes (globale registry)' })
  async findAll(
    @Query('includeInactive') includeInactive?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return {
      success: true,
      data: await this.service.findAll({
        includeInactive: includeInactive === 'true',
        includeDeleted: includeDeleted === 'true',
      }),
    };
  }

  @Get('code/:code')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Normtype op code' })
  async findByCode(@Param('code') code: string) {
    return { success: true, data: await this.service.findByCode(code) };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Normtype detail' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findById(id) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Normtype aanmaken (alleen SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateNormTypeDto) {
    return { success: true, data: await this.service.create(dto, user.id) };
  }

  @Patch(':id/restore')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Normtype herstellen (deletedAt = null)' })
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.restore(id) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Normtype bijwerken (alleen SUPERUSER)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNormTypeDto,
  ) {
    return { success: true, data: await this.service.update(id, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Normtype verwijderen (soft-delete via deletedAt)' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.softDelete(id) };
  }
}
