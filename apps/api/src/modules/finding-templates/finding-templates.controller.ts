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
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF, ORG_ADMINS } from '@/common/auth/roles';
import { FindingTemplatesService } from './finding-templates.service';
import {
  CreateFindingTemplateDto,
  UpdateFindingTemplateDto,
  QueryFindingTemplatesDto,
  ImportFindingTemplatesDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

const READ_ROLES = ALL_STAFF;
const WRITE_ROLES = ORG_ADMINS;

@ApiTags('finding-templates')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('finding-templates')
export class FindingTemplatesController {
  constructor(private readonly service: FindingTemplatesService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Constateringssjablonen (systeem + org)' })
  async findAll(@CurrentUser() user: User, @Query() query: QueryFindingTemplatesDto) {
    return { success: true, ...(await this.service.findAll(user, query)) };
  }

  @Get('all')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary: 'Alle actieve sjablonen (org + systeem) zonder paginatie — voor de inspecteur-PWA',
  })
  async findAllActive(@CurrentUser() user: User) {
    return { success: true, data: await this.service.findAllActive(user) };
  }

  @Get('categories')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Categorieën die door sjablonen worden gebruikt' })
  async getUsedCategories(
    @CurrentUser() user: User,
    @Query('includeSystem') includeSystem?: string,
  ) {
    const data = await this.service.getUsedCategories(user, includeSystem !== 'false');
    return { success: true, data };
  }

  @Get('export')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sjablonen exporteren naar JSON' })
  async exportTemplates(@CurrentUser() user: User, @Query('ids') ids?: string) {
    const idArray = ids ? ids.split(',').filter(Boolean) : undefined;
    const data = await this.service.export(user, idArray);
    return { success: true, data };
  }

  @Post('import')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sjablonen importeren uit JSON' })
  async importTemplates(
    @CurrentUser() user: User,
    @Body() dto: ImportFindingTemplatesDto,
  ) {
    const data = await this.service.import(user, dto);
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Constateringssjabloon detail' })
  async findById(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sjabloon aanmaken (org, of systeem als SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateFindingTemplateDto) {
    return { success: true, data: await this.service.create(user, dto) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sjabloon bijwerken' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateFindingTemplateDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sjabloon verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }

  @Post(':id/duplicate')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Sjabloon naar eigen org dupliceren' })
  async duplicate(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() body: { code?: string },
  ) {
    return { success: true, data: await this.service.duplicate(id, user, body?.code) };
  }
}
