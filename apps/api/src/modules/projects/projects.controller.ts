import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ProjectsService } from './projects.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ListProjectsQueryDto,
  AddProjectFollowerDto,
  AssignToProjectDto,
} from './dto';

const CRM_ROLES = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];
const WRITE_ROLES = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // ── Specific routes BEFORE :id ──

  @Post('from-request/:requestId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create project from request' })
  async createFromRequest(
    @CurrentUser() user: User,
    @Param('requestId') requestId: string,
  ) {
    return this.projectsService.createFromRequest(requestId, user);
  }

  // ── CRUD ──

  @Get()
  @Roles(...CRM_ROLES, Role.INSPECTEUR)
  @ApiOperation({ summary: 'List projects' })
  async findAll(@CurrentUser() user: User, @Query() query: ListProjectsQueryDto) {
    return this.projectsService.findAll(user, query);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create project' })
  async create(@CurrentUser() user: User, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto, user);
  }

  // ── Sub-resources (BEFORE :id) ──

  @Get(':id/requests')
  @Roles(...CRM_ROLES, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Get linked requests' })
  async getLinkedRequests(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.getLinkedRequests(id, user);
  }

  @Get(':id/quotes')
  @Roles(...CRM_ROLES, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Get linked quotes' })
  async getLinkedQuotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.getLinkedQuotes(id, user);
  }

  @Get(':id/planning')
  @Roles(...CRM_ROLES, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Get linked planning items' })
  async getLinkedPlanning(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.getLinkedPlanning(id, user);
  }

  @Get(':id/locations')
  @Roles(...CRM_ROLES, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Get aggregated locations from linked requests, quotes and planning items' })
  async getLinkedLocations(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.getLinkedLocations(id, user);
  }

  @Post(':id/assign')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Assign entities to project' })
  async assignEntities(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AssignToProjectDto,
  ) {
    return this.projectsService.assignEntities(id, dto, user);
  }

  @Post(':id/unassign')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Unassign entities from project' })
  async unassignEntities(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AssignToProjectDto,
  ) {
    return this.projectsService.unassignEntities(id, dto, user);
  }

  @Get(':id/followers')
  @Roles(...CRM_ROLES, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Get project followers' })
  async getFollowers(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.getFollowers(id, user);
  }

  @Post(':id/followers')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Add project follower' })
  async addFollower(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AddProjectFollowerDto,
  ) {
    return this.projectsService.addFollower(id, dto, user);
  }

  @Delete(':id/followers/:followerId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Remove project follower' })
  async removeFollower(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('followerId') followerId: string,
  ) {
    return this.projectsService.removeFollower(id, followerId, user);
  }

  // ── Single resource ──

  @Get(':id')
  @Roles(...CRM_ROLES, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Get project detail' })
  async findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update project' })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Soft delete project' })
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.remove(id, user);
  }
}
