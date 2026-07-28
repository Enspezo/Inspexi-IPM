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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF, CRM_ROLES, REVIEW_ROLES } from '@/common/auth/roles';
import { InspectionPlansService } from './inspection-plans.service';
import { CreateAssetNodeDto } from '../asset-nodes/dto';
import {
  CreateInspectionPlanDto,
  UpdateInspectionPlanDto,
  ListInspectionPlansQueryDto,
  SubmitInspectionPlanDto,
  ReviewInspectionPlanDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

const WRITE_ROLES = CRM_ROLES;

const ALL_ROLES = ALL_STAFF;

@ApiTags('inspection-plans')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('inspection-plans')
export class InspectionPlansController {
  constructor(private readonly service: InspectionPlansService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Inspectieplannen ophalen (gepagineerd)' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListInspectionPlansQueryDto,
  ) {
    return { success: true, data: await this.service.findAll(user, query) };
  }

  // Specifieke routes vóór parameterized routes (NestJS route-volgorde).
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Indienen ter review' })
  async submit(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: SubmitInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.submit(id, dto, user) };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(...REVIEW_ROLES)
  @ApiOperation({ summary: 'Inspectieplan beoordelen (goedkeuren/afkeuren)' })
  async review(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: ReviewInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.review(id, dto, user) };
  }

  // ── Scope-deellocaties + vanuit-inspectie asset-nodes ──
  @Get(':id/scope-locations')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Scope-deellocaties van een inspectieplan' })
  async listScopeLocations(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.listScopeLocations(id, user) };
  }

  @Post(':id/scope-locations/:assetNodeId')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Deellocatie aan de scope toevoegen' })
  async addScopeLocation(
    @Param('id', ParseUuidPipe) id: string,
    @Param('assetNodeId', ParseUuidPipe) assetNodeId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.addScopeLocation(id, assetNodeId, user) };
  }

  @Delete(':id/scope-locations/:assetNodeId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Deellocatie uit de scope verwijderen' })
  async removeScopeLocation(
    @Param('id', ParseUuidPipe) id: string,
    @Param('assetNodeId', ParseUuidPipe) assetNodeId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.removeScopeLocation(id, assetNodeId, user) };
  }

  @Post(':id/asset-nodes')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Asset-node aanmaken vanuit een inspectie (parent defaultet naar scope/wortel)',
  })
  async createAssetNode(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CreateAssetNodeDto,
    @CurrentUser() user: User,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return {
      success: true,
      data: await this.service.createAssetNodeFromPlan(id, user, dto, deviceId),
    };
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Inspectieplan detail' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.findOne(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectieplan aanmaken' })
  async create(
    @Body() dto: CreateInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.create(dto, user) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectieplan bijwerken' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.update(id, dto, user) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectieplan verwijderen (soft-delete)' })
  async remove(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.service.remove(id, user);
    return { success: true, message: 'Inspectieplan verwijderd' };
  }
}
