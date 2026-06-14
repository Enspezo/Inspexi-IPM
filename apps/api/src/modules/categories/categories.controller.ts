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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
  ListCategoriesQueryDto,
  TreeQueryDto,
} from './dto';

const READ_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
] as const;
const WRITE_ROLES = [Role.SUPERUSER, Role.ORG_ADMIN] as const;

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Categorieën (systeem + org), plat' })
  async findAll(@CurrentUser() user: User, @Query() query: ListCategoriesQueryDto) {
    return {
      success: true,
      data: await this.service.findAll(user, {
        includeSystem: query.includeSystem,
        parentId: query.parentId,
        flat: query.flat,
        includeInactive: query.includeInactive,
      }),
    };
  }

  @Get('tree')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Categorieën als boomstructuur' })
  async getTree(@CurrentUser() user: User, @Query() query: TreeQueryDto) {
    return {
      success: true,
      data: await this.service.getTree(user, {
        includeSystem: query.includeSystem,
        includeInactive: query.includeInactive,
      }),
    };
  }

  @Post('reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Categorieën herordenen (sorteervolgorde)' })
  async reorder(@CurrentUser() user: User, @Body() dto: ReorderCategoriesDto) {
    return { success: true, data: await this.service.reorder(user, dto) };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Categorie detail (met ouder + kinderen)' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Categorie aanmaken (org, of systeem als SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateCategoryDto) {
    return { success: true, data: await this.service.create(user, dto) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Categorie bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateCategoryDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Categorie verwijderen' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
