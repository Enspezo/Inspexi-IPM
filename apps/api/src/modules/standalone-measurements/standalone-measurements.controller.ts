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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { StandaloneMeasurementsService } from './standalone-measurements.service';
import {
  CreateStandaloneMeasurementDto,
  UpdateStandaloneMeasurementDto,
  AddValueDto,
  LinkAssetDto,
  ListQueryDto,
} from './dto';

const ALL = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
] as const;

@ApiTags('standalone-measurements')
@ApiBearerAuth()
@Controller()
export class StandaloneMeasurementsController {
  constructor(private readonly service: StandaloneMeasurementsService) {}

  @Get('inspection-plans/:planId/standalone-measurements')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Ad-hoc metingen onder een inspectieplan' })
  async findAllByPlan(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Query() query: ListQueryDto,
  ) {
    return {
      success: true,
      data: await this.service.findAllByPlan(planId, user, { locationId: query.locationId }),
    };
  }

  @Post('inspection-plans/:planId/standalone-measurements')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Ad-hoc meting aanmaken onder een plan' })
  async create(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateStandaloneMeasurementDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(planId, user, dto, deviceId) };
  }

  @Post('standalone-measurements/:id/values')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meetwaarde toevoegen aan een meting' })
  async addValue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddValueDto,
  ) {
    return { success: true, data: await this.service.addValue(id, user, dto) };
  }

  @Post('standalone-measurements/:id/link-asset')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset koppelen aan een meting' })
  async linkAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: LinkAssetDto,
  ) {
    return { success: true, data: await this.service.linkAsset(id, user, dto) };
  }

  @Get('standalone-measurements/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting detail' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('standalone-measurements/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateStandaloneMeasurementDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete('standalone-measurements/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
