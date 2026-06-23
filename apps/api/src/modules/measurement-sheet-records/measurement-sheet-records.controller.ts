import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { MeasurementSheetRecordsService } from './measurement-sheet-records.service';
import {
  CreateMeasurementSheetRecordDto,
  UpdateMeasurementSheetRecordDto,
  QueryMeasurementSheetRecordsDto,
} from './dto';

const ALL = ALL_STAFF;

@ApiTags('measurement-sheet-records')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('measurement-sheet-records')
export class MeasurementSheetRecordsController {
  constructor(private readonly service: MeasurementSheetRecordsService) {}

  @Get()
  @Roles(...ALL)
  @ApiOperation({ summary: 'Ingevulde meetstaten (filters: assetId, inspectionPlanId, templateId, status)' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: QueryMeasurementSheetRecordsDto,
  ) {
    return { success: true, data: await this.service.findAll(user, query) };
  }

  @Post()
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meetstaat aanmaken (snapshot van een globaal template)' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateMeasurementSheetRecordDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(user, dto, deviceId) };
  }

  @Post(':id/validate')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meetstaat valideren tegen de snapshot (zonder status te wijzigen)' })
  async validate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.validate(id, user) };
  }

  @Post(':id/complete')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meetstaat afronden (final-check + status naar COMPLETED)' })
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.complete(id, user) };
  }

  @Get(':id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meetstaat detail (incl. snapshot)' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch(':id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meetstaat-data bijwerken (alleen IN_PROGRESS)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMeasurementSheetRecordDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.update(id, user, dto, deviceId) };
  }

  @Delete(':id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meetstaat verwijderen (alleen IN_PROGRESS, harde delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
