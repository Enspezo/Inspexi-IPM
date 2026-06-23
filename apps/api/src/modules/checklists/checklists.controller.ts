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
  BadRequestException,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, ChecklistStatus } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF, ORG_ADMINS } from '@/common/auth/roles';
import { ChecklistsService } from './checklists.service';
import {
  CreateChecklistDto,
  UpdateChecklistDto,
  AddItemToChecklistDto,
  UpdateItemLinkDto,
  ReorderItemsDto,
  PublishChecklistDto,
  RetireChecklistDto,
  NewVersionDto,
  ImportChecklistDto,
} from './dto';

const READ_ROLES = ALL_STAFF;
const WRITE_ROLES = ORG_ADMINS;

@ApiTags('checklists')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly service: ChecklistsService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Checklists (systeem + org)' })
  async findAll(
    @CurrentUser() user: User,
    @Query('normType') normType?: string,
    @Query('assetType') assetType?: string,
    @Query('locationType') locationType?: string,
    @Query('status') status?: ChecklistStatus,
    @Query('includeSystem') includeSystem?: string,
  ) {
    const data = await this.service.findAll(user, {
      normType,
      assetType,
      locationType,
      status,
      includeSystem: includeSystem !== 'false',
    });
    return { success: true, data };
  }

  @Get('for-asset')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Actieve checklist voor asset/locatie (PWA)' })
  async getForAsset(
    @CurrentUser() user: User,
    @Query('normType') normType: string,
    @Query('assetType') assetType: string,
    @Query('locationType') locationType?: string,
  ) {
    if (!user.orgId) {
      throw new BadRequestException('Een organisatie is vereist');
    }
    if (!normType || !assetType) {
      throw new BadRequestException('normType en assetType zijn verplicht');
    }
    const data = await this.service.getActiveChecklistForAsset(
      normType,
      assetType,
      locationType || null,
      user.orgId,
    );
    return { success: true, data };
  }

  @Post('import')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist importeren vanuit JSON' })
  async import(@CurrentUser() user: User, @Body() dto: ImportChecklistDto) {
    return { success: true, data: await this.service.import(user, dto) };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Checklist detail (met items)' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Get(':id/preview')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Preview voor PWA-weergave' })
  async getPreview(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.getPreview(id, user) };
  }

  @Get(':id/export')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Checklist exporteren als JSON' })
  async export(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.export(id, user);
  }

  @Get(':id/history')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Versie-historie' })
  async getHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.getHistory(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist aanmaken (org, of systeem als SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateChecklistDto) {
    return { success: true, data: await this.service.create(user, dto) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist bijwerken (alleen CONCEPT)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateChecklistDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist verwijderen (alleen CONCEPT)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }

  // ── Item-koppelingen ──

  @Post(':id/items')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Item aan checklist koppelen' })
  async addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddItemToChecklistDto,
  ) {
    return { success: true, data: await this.service.addItem(id, user, dto) };
  }

  @Post(':id/items/reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Items herordenen (drag & drop)' })
  async reorderItems(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ReorderItemsDto,
  ) {
    return { success: true, data: await this.service.reorderItems(id, user, dto.itemLinkIds) };
  }

  @Patch(':checklistId/items/:linkId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Item-koppeling bijwerken' })
  async updateItemLink(
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateItemLinkDto,
  ) {
    return { success: true, data: await this.service.updateItemLink(linkId, user, dto) };
  }

  @Delete(':checklistId/items/:linkId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Item uit checklist verwijderen' })
  async removeItem(
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.removeItem(linkId, user) };
  }

  // ── Versiebeheer ──

  @Post(':id/publish')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist publiceren (CONCEPT → ACTIEF)' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: PublishChecklistDto,
  ) {
    return { success: true, data: await this.service.publish(id, user, dto) };
  }

  @Post(':id/retire')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist vervallen verklaren (ACTIEF → VERVALLEN)' })
  async retire(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RetireChecklistDto,
  ) {
    return { success: true, data: await this.service.retire(id, user, dto) };
  }

  @Post(':id/new-version')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Nieuwe versie aanmaken (kloon naar CONCEPT)' })
  async createNewVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: NewVersionDto,
  ) {
    return { success: true, data: await this.service.createNewVersion(id, user, dto) };
  }
}
