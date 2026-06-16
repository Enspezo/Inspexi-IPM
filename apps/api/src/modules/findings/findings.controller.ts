// Route-roots: assets/:assetId/findings + findings/:id. INSPECTEUR mag schrijven (PWA).

import {
  Controller, Get, Post, Patch, Delete, Param, Body, Headers, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { FindingsService } from './findings.service';
import { CreateFindingDto, UpdateFindingDto } from './dto';

const ALL = ALL_STAFF;

@ApiTags('Findings')
@ApiBearerAuth()
@Controller()
export class FindingsController {
  constructor(private readonly service: FindingsService) {}

  @Get('assets/:assetId/findings')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Constateringen per asset' })
  async findAllByAsset(@Param('assetId', ParseUUIDPipe) assetId: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findAllByAsset(assetId, user) };
  }

  @Post('assets/:assetId/findings')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Constatering aanmaken op een asset' })
  async create(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateFindingDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(assetId, user, dto, deviceId) };
  }

  @Get('findings/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Constatering detail' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('findings/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Constatering bijwerken (incl. afhandelen)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateFindingDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete('findings/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Constatering verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
