import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CRM_ROLES } from '@/common/auth/roles';
import { ProjectPhasesService } from './project-phases.service';
import {
  CreateProjectPhaseDto,
  UpdateProjectPhaseDto,
  ReorderPhasesDto,
  AddPhaseFollowerDto,
  UpdatePhaseFollowerDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto';

const WRITE_ROLES = CRM_ROLES;
const READ_ROLES = [...CRM_ROLES, Role.INSPECTEUR];

@ApiTags('project-phases')
@RequiresFeature('BASIS_UITVOERING')
@Controller('projects/:projectId/phases')
export class ProjectPhasesController {
  constructor(private readonly service: ProjectPhasesService) {}

  // ── List / create ──

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Fasen van een project' })
  async findAll(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return { success: true, data: await this.service.findAll(projectId, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Fase aanmaken' })
  async create(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectPhaseDto,
  ) {
    return { success: true, data: await this.service.create(projectId, dto, user) };
  }

  // ── Specific routes BEFORE :id ──

  @Post('reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Fasen herordenen' })
  async reorder(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: ReorderPhasesDto,
  ) {
    return { success: true, data: await this.service.reorder(projectId, dto, user) };
  }

  // ── Followers (BEFORE :id) ──

  @Get(':id/followers')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Volgers van een fase' })
  async getFollowers(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.service.getFollowers(projectId, id, user) };
  }

  @Post(':id/followers')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Fasevolger toevoegen' })
  async addFollower(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: AddPhaseFollowerDto,
  ) {
    return { success: true, data: await this.service.addFollower(projectId, id, dto, user) };
  }

  @Patch(':id/followers/:followerId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Fasevolger bijwerken' })
  async updateFollower(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('followerId') followerId: string,
    @Body() dto: UpdatePhaseFollowerDto,
  ) {
    return {
      success: true,
      data: await this.service.updateFollower(projectId, id, followerId, dto, user),
    };
  }

  @Delete(':id/followers/:followerId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Fasevolger verwijderen' })
  async removeFollower(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('followerId') followerId: string,
  ) {
    return {
      success: true,
      data: await this.service.removeFollower(projectId, id, followerId, user),
    };
  }

  // ── Milestones (BEFORE :id) ──

  @Get(':id/milestones')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Milestones van een fase' })
  async getMilestones(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.service.getMilestones(projectId, id, user) };
  }

  @Post(':id/milestones')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Milestone toevoegen' })
  async addMilestone(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return { success: true, data: await this.service.addMilestone(projectId, id, dto, user) };
  }

  @Patch(':id/milestones/:milestoneId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Milestone bijwerken (incl. status)' })
  async updateMilestone(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return {
      success: true,
      data: await this.service.updateMilestone(projectId, id, milestoneId, dto, user),
    };
  }

  @Delete(':id/milestones/:milestoneId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Milestone verwijderen' })
  async removeMilestone(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return {
      success: true,
      data: await this.service.removeMilestone(projectId, id, milestoneId, user),
    };
  }

  // ── Single resource ──

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Fase-detail' })
  async findOne(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.service.findOne(projectId, id, user) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Fase bijwerken' })
  async update(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectPhaseDto,
  ) {
    return { success: true, data: await this.service.update(projectId, id, dto, user) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Fase verwijderen (soft-delete)' })
  async remove(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.service.remove(projectId, id, user) };
  }
}
