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
import { InspectionLocationsService } from './inspection-locations.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  MoveLocationDto,
  ReorderLocationsDto,
} from './dto';

const ALL = ALL_STAFF;

@ApiTags('inspection-locations')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class InspectionLocationsController {
  constructor(private readonly service: InspectionLocationsService) {}

  @Get('inspection-plans/:planId/locations')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locaties per inspectieplan (boom of plat)' })
  async findAllByPlan(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Query('parentId') parentId?: string,
    @Query('flat') flat?: string,
  ) {
    return {
      success: true,
      data: await this.service.findAllByPlan(planId, user, { parentId, flat: flat === 'true' }),
    };
  }

  @Get('inspection-plans/:planId/locations/tree')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Hiërarchische boom van locaties' })
  async getTree(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.getTree(planId, user) };
  }

  @Get('inspection-plans/:planId/locations/count')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Aantal locaties voor een plan' })
  async getCount(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.getCountByPlan(planId, user) };
  }

  @Post('inspection-plans/:planId/locations')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie aanmaken onder een plan' })
  async create(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateLocationDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(planId, user, dto, deviceId) };
  }

  @Post('inspection-plans/:planId/locations/reorder')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locaties herordenen' })
  async reorder(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Body() dto: ReorderLocationsDto,
  ) {
    return { success: true, data: await this.service.reorder(planId, user, dto) };
  }

  @Get('locations/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie detail' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('locations/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateLocationDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Post('locations/:id/move')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie verplaatsen in de boom' })
  async move(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: MoveLocationDto,
  ) {
    return { success: true, data: await this.service.move(id, user, dto) };
  }

  @Delete('locations/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Locatie verwijderen (soft-delete, incl. kinderen)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
