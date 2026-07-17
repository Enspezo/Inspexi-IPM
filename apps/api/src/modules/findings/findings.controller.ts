// Route-roots: assets/:assetId/findings + findings/:id. INSPECTEUR mag schrijven (PWA).
// NB: de specifieke route findings/resolution-photos/:id staat vóór findings/:id
// (NestJS route-volgorde).

import {
  Controller, Get, Post, Patch, Delete, Param, Body, Headers, ParseUUIDPipe,
  Res, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { FindingsService } from './findings.service';
import { CreateFindingDto, UpdateFindingDto } from './dto';

const ALL = ALL_STAFF;

@ApiTags('Findings')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
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

  @Get('findings/resolution-photos/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Herstel-resolutiefoto downloaden (staf, org-scoped)' })
  async resolutionPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.service.getResolutionPhoto(id, user);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=86400' });
    return new StreamableFile(buffer);
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
