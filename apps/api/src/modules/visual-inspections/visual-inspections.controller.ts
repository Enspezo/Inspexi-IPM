// Route-roots: assets/:assetId/visual-inspections + visual-inspections/:id.
// INSPECTEUR mag schrijven (PWA). Globale guards — geen @UseGuards.

import {
  Controller, Get, Post, Patch, Delete, Param, Body, Headers, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { VisualInspectionsService } from './visual-inspections.service';
import { CreateVisualInspectionDto, UpdateVisualInspectionDto } from './dto';

const ALL = ALL_STAFF;

@ApiTags('visual-inspections')
@ApiBearerAuth()
@Controller()
export class VisualInspectionsController {
  constructor(private readonly service: VisualInspectionsService) {}

  @Get('assets/:assetId/visual-inspections')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspecties per asset' })
  async findAllByAsset(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.findAllByAsset(assetId, user) };
  }

  @Post('assets/:assetId/visual-inspections')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie aanmaken op een asset' })
  async create(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateVisualInspectionDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(assetId, user, dto, deviceId) };
  }

  @Get('visual-inspections/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie detail' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('visual-inspections/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie bijwerken (status/checklist)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateVisualInspectionDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Post('visual-inspections/:id/start')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie starten (status → in uitvoering)' })
  async start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.start(id, user) };
  }

  @Post('visual-inspections/:id/complete')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie afronden (status → voltooid)' })
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.complete(id, user) };
  }

  @Delete('visual-inspections/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie verwijderen (hard delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
