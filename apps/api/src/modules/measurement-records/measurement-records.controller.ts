// Route-roots: assets/:assetId/measurement-records + measurement-records/:id.
// INSPECTEUR mag schrijven (PWA / offline uitvoering).

import {
  Controller, Get, Post, Patch, Delete, Param, Body, Headers, ParseUUIDPipe,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { MeasurementRecordsService } from './measurement-records.service';
import { CreateMeasurementRecordDto, UpdateMeasurementRecordDto } from './dto';

const ALL = ALL_STAFF;

@ApiTags('measurement-records')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class MeasurementRecordsController {
  constructor(private readonly service: MeasurementRecordsService) {}

  @Get('assets/:assetId/measurement-records')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Metingen per asset' })
  async findAllByAsset(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.findAllByAsset(assetId, user) };
  }

  @Post('assets/:assetId/measurement-records')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting aanmaken op een asset' })
  async create(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateMeasurementRecordDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(assetId, user, dto, deviceId) };
  }

  @Get('measurement-records/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting detail (incl. constateringen)' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('measurement-records/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting bijwerken (status / meetwaarden / instrument)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMeasurementRecordDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Post('measurement-records/:id/start')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting starten (status → in_progress)' })
  async start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.start(id, user) };
  }

  @Post('measurement-records/:id/complete')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting afronden (status → completed)' })
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.complete(id, user) };
  }

  @Delete('measurement-records/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting verwijderen (hard delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
