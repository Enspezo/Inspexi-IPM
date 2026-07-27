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
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { StandaloneMeasurementsService } from './standalone-measurements.service';
import {
  CreateStandaloneMeasurementDto,
  UpdateStandaloneMeasurementDto,
  AddValueDto,
  LinkAssetDto,
  ListQueryDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

const ALL = ALL_STAFF;

@ApiTags('standalone-measurements')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class StandaloneMeasurementsController {
  constructor(private readonly service: StandaloneMeasurementsService) {}

  @Get('inspection-plans/:planId/standalone-measurements')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Ad-hoc metingen onder een inspectieplan' })
  async findAllByPlan(
    @Param('planId', ParseUuidPipe) planId: string,
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
    @Param('planId', ParseUuidPipe) planId: string,
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
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddValueDto,
  ) {
    return { success: true, data: await this.service.addValue(id, user, dto) };
  }

  @Post('standalone-measurements/:id/link-asset')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset koppelen aan een meting' })
  async linkAsset(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: LinkAssetDto,
  ) {
    return { success: true, data: await this.service.linkAsset(id, user, dto) };
  }

  @Get('standalone-measurements/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting detail' })
  async findById(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('standalone-measurements/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting bijwerken' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateStandaloneMeasurementDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete('standalone-measurements/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Meting verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
