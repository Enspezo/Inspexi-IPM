// Route-roots: assets/:assetId/visual-inspections + visual-inspections/:id.
// INSPECTEUR mag schrijven (PWA). Globale guards — geen @UseGuards.

import {
  Controller, Get, Post, Patch, Delete, Param, Body, Headers,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { VisualInspectionsService } from './visual-inspections.service';
import { CreateVisualInspectionDto, UpdateVisualInspectionDto } from './dto';
import { ParseUuidPipe } from '@/common';

const ALL = ALL_STAFF;

@ApiTags('visual-inspections')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class VisualInspectionsController {
  constructor(private readonly service: VisualInspectionsService) {}

  @Get('assets/:assetId/visual-inspections')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspecties per asset' })
  async findAllByAsset(
    @Param('assetId', ParseUuidPipe) assetId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.findAllByAsset(assetId, user) };
  }

  @Post('assets/:assetId/visual-inspections')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie aanmaken op een asset' })
  async create(
    @Param('assetId', ParseUuidPipe) assetId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateVisualInspectionDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(assetId, user, dto, deviceId) };
  }

  @Get('visual-inspections/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie detail' })
  async findById(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('visual-inspections/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie bijwerken (status/checklist)' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateVisualInspectionDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Post('visual-inspections/:id/start')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie starten (status → in uitvoering)' })
  async start(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.start(id, user) };
  }

  @Post('visual-inspections/:id/complete')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie afronden (status → voltooid)' })
  async complete(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.complete(id, user) };
  }

  @Delete('visual-inspections/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Visuele inspectie verwijderen (hard delete)' })
  async delete(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
