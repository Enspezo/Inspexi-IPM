import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ChecklistItemsService } from './checklist-items.service';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto';

const READ_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
] as const;
const WRITE_ROLES = [Role.SUPERUSER, Role.ORG_ADMIN] as const;

@ApiTags('checklists')
@ApiBearerAuth()
@Controller('checklist-items')
export class ChecklistItemsController {
  constructor(private readonly service: ChecklistItemsService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Checklist-items (systeem + org)' })
  async findAll(
    @CurrentUser() user: User,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('includeSystem') includeSystem?: string,
  ) {
    const data = await this.service.findAll(user, {
      categoryId,
      search,
      includeSystem: includeSystem !== 'false',
    });
    return { success: true, data };
  }

  @Get('categories')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Categorieën die door checklist-items gebruikt worden' })
  async getUsedCategories(@CurrentUser() user: User) {
    return { success: true, data: await this.service.getUsedCategories(user) };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Checklist-item detail' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist-item aanmaken (org, of systeem als SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateChecklistItemDto) {
    return { success: true, data: await this.service.create(user, dto) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist-item bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist-item verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
