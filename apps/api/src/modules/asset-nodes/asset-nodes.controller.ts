import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { AssetNodesService } from './asset-nodes.service';
import { CreateAssetNodeDto, UpdateAssetNodeDto, MoveAssetNodeDto } from './dto';
import { ParseUuidPipe } from '@/common';

const ALL = ALL_STAFF;

@ApiTags('asset-nodes')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller()
export class AssetNodesController {
  constructor(private readonly service: AssetNodesService) {}

  @Get('locations/:locationId/tree')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Hele AssetNode-boom voor een CRM-Locatie (maakt wortel aan)' })
  async treeForLocation(
    @Param('locationId', ParseUuidPipe) locationId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.getTreeForLocation(locationId, user) };
  }

  @Get('inspection-plans/:planId/tree')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Boom van de hoofdlocatie van een inspectieplan (scope gemarkeerd)' })
  async treeForPlan(
    @Param('planId', ParseUuidPipe) planId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.getTreeForPlan(planId, user) };
  }

  @Get('asset-nodes/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Node-detail' })
  async findById(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Post('asset-nodes')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Node aanmaken (wortel of onder een parent)' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateAssetNodeDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return { success: true, data: await this.service.create(user, dto, deviceId) };
  }

  @Patch('asset-nodes/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Node bijwerken (inhoud; niet de hiërarchie)' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateAssetNodeDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Post('asset-nodes/:id/move')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Node verplaatsen in de boom (subtree-pad via DB-trigger)' })
  async move(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: MoveAssetNodeDto,
  ) {
    return { success: true, data: await this.service.move(id, user, dto) };
  }

  @Delete('asset-nodes/:id')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Node + subtree verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
