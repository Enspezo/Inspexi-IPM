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
import { AssetsService } from './assets.service';
import {
  CreateAssetDto,
  UpdateAssetDto,
  MoveAssetDto,
  ReorderAssetsDto,
  ListAssetsQueryDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

const ALL = ALL_STAFF;

@ApiTags('assets')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get('assets')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Organisatie-breed asset-register (gepagineerd)' })
  async findAll(@CurrentUser() user: User, @Query() query: ListAssetsQueryDto) {
    return { success: true, data: await this.service.findAllForOrganization(user, query) };
  }

  @Get('inspection-plans/:planId/assets')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Assets per inspectieplan (boom of plat)' })
  async findAllByPlan(
    @Param('planId', ParseUuidPipe) planId: string,
    @CurrentUser() user: User,
    @Query('parentId') parentId?: string,
    @Query('flat') flat?: string,
  ) {
    return {
      success: true,
      data: await this.service.findAllByPlan(planId, user, { parentId, flat: flat === 'true' }),
    };
  }

  @Post('inspection-plans/:planId/assets')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset aanmaken onder een plan' })
  async create(
    @Param('planId', ParseUuidPipe) planId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateAssetDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(planId, user, dto, deviceId) };
  }

  @Post('inspection-plans/:planId/assets/reorder')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Assets herordenen' })
  async reorder(
    @Param('planId', ParseUuidPipe) planId: string,
    @CurrentUser() user: User,
    @Body() dto: ReorderAssetsDto,
  ) {
    return { success: true, data: await this.service.reorder(planId, user, dto) };
  }

  @Get('assets/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset detail' })
  async findById(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Patch('assets/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset bijwerken' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateAssetDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Post('assets/:id/move')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset verplaatsen in de boom' })
  async move(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: MoveAssetDto,
  ) {
    return { success: true, data: await this.service.move(id, user, dto) };
  }

  @Delete('assets/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Asset verwijderen (soft-delete, incl. kinderen)' })
  async delete(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
