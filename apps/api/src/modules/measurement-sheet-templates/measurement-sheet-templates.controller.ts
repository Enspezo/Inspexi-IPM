import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role, MeasurementSheetTemplateStatus } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { MeasurementSheetTemplatesService } from './measurement-sheet-templates.service';
import { MeasurementSheetSectionsService } from './measurement-sheet-sections.service';
import { MeasurementSheetFieldsService } from './measurement-sheet-fields.service';
import {
  CreateMeasurementSheetTemplateDto,
  UpdateMeasurementSheetTemplateDto,
  PublishMeasurementSheetTemplateDto,
  RetireMeasurementSheetTemplateDto,
  NewVersionDto,
  UpdateFinalCheckRulesDto,
  CreateMeasurementSheetSectionDto,
  UpdateMeasurementSheetSectionDto,
  ReorderSectionsDto,
  CreateMeasurementSheetFieldDto,
  UpdateMeasurementSheetFieldDto,
  ReorderFieldsDto,
} from './dto';

// Globaal: iedereen leest, alleen SUPERUSER schrijft.
const READ_ROLES = ALL_STAFF;

@ApiTags('measurement-sheet-templates')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('measurement-sheet-templates')
export class MeasurementSheetTemplatesController {
  constructor(
    private readonly templatesService: MeasurementSheetTemplatesService,
    private readonly sectionsService: MeasurementSheetSectionsService,
    private readonly fieldsService: MeasurementSheetFieldsService,
  ) {}

  // =====================================================
  // SPECIFIEKE ROUTES (vóór generieke :id)
  // =====================================================

  @Get('for-asset')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Actief template voor asset-type + norm (PWA)' })
  async getForAsset(
    @Query('normType') normType: string,
    @Query('assetType') assetType: string,
    @Query('locationType') locationType?: string,
  ) {
    const data = await this.templatesService.getActiveTemplateForAsset(
      normType,
      assetType,
      locationType,
    );
    return { success: true, data };
  }

  // ── Sectie-reorder (literal segment vóór :sectionId) ──
  @Post(':templateId/sections/reorder')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Secties herordenen (SUPERUSER)' })
  async reorderSections(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @CurrentUser() user: User,
    @Body() dto: ReorderSectionsDto,
  ) {
    const data = await this.sectionsService.reorder(
      templateId,
      user.id,
      dto.sectionIds,
    );
    return { success: true, data };
  }

  // ── Veld-reorder (literal segment vóór :fieldId) ──
  @Post(':templateId/sections/:sectionId/fields/reorder')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Velden herordenen (SUPERUSER)' })
  async reorderFields(
    @Param('templateId', ParseUUIDPipe) _templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() user: User,
    @Body() dto: ReorderFieldsDto,
  ) {
    const data = await this.fieldsService.reorder(
      sectionId,
      user.id,
      dto.fieldIds,
    );
    return { success: true, data };
  }

  // ── Velden van een sectie ──
  @Get(':templateId/sections/:sectionId/fields')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Velden van een sectie' })
  async getFields(
    @Param('templateId', ParseUUIDPipe) _templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    return { success: true, data: await this.fieldsService.getFields(sectionId) };
  }

  @Post(':templateId/sections/:sectionId/fields')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Veld toevoegen aan sectie (SUPERUSER)' })
  async addField(
    @Param('templateId', ParseUUIDPipe) _templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateMeasurementSheetFieldDto,
  ) {
    const data = await this.fieldsService.create(sectionId, user.id, dto);
    return { success: true, data };
  }

  @Patch(':templateId/sections/:sectionId/fields/:fieldId')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Veld bijwerken (SUPERUSER)' })
  async updateField(
    @Param('templateId', ParseUUIDPipe) _templateId: string,
    @Param('sectionId', ParseUUIDPipe) _sectionId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMeasurementSheetFieldDto,
  ) {
    const data = await this.fieldsService.update(fieldId, user.id, dto);
    return { success: true, data };
  }

  @Delete(':templateId/sections/:sectionId/fields/:fieldId')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Veld verwijderen (SUPERUSER)' })
  async deleteField(
    @Param('templateId', ParseUUIDPipe) _templateId: string,
    @Param('sectionId', ParseUUIDPipe) _sectionId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.fieldsService.delete(fieldId, user.id);
    return { success: true, data };
  }

  // ── Secties ──
  @Get(':id/sections')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Secties van een template' })
  async getSections(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.sectionsService.getSections(id) };
  }

  @Post(':id/sections')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Sectie toevoegen aan template (SUPERUSER)' })
  async addSection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateMeasurementSheetSectionDto,
  ) {
    const data = await this.sectionsService.create(id, user.id, dto);
    return { success: true, data };
  }

  @Patch(':templateId/sections/:sectionId')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Sectie bijwerken (SUPERUSER)' })
  async updateSection(
    @Param('templateId', ParseUUIDPipe) _templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMeasurementSheetSectionDto,
  ) {
    const data = await this.sectionsService.update(sectionId, user.id, dto);
    return { success: true, data };
  }

  @Delete(':templateId/sections/:sectionId')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Sectie verwijderen (SUPERUSER)' })
  async deleteSection(
    @Param('templateId', ParseUUIDPipe) _templateId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.sectionsService.delete(sectionId, user.id);
    return { success: true, data };
  }

  // ── Versiebeheer + final-check ──
  @Get(':id/history')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Versiegeschiedenis van een template' })
  async getHistory(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templatesService.getHistory(id) };
  }

  @Post(':id/publish')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Template publiceren CONCEPT→ACTIEF (SUPERUSER)' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: PublishMeasurementSheetTemplateDto,
  ) {
    return { success: true, data: await this.templatesService.publish(id, user, dto) };
  }

  @Post(':id/retire')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Template laten vervallen ACTIEF→VERVALLEN (SUPERUSER)' })
  async retire(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RetireMeasurementSheetTemplateDto,
  ) {
    return { success: true, data: await this.templatesService.retire(id, user, dto) };
  }

  @Post(':id/new-version')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Nieuwe versie maken (clone → CONCEPT) (SUPERUSER)' })
  async createNewVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: NewVersionDto,
  ) {
    return {
      success: true,
      data: await this.templatesService.createNewVersion(id, user, dto),
    };
  }

  @Get(':id/final-check-rules')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Final-check-regels ophalen' })
  async getFinalCheckRules(@Param('id', ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.templatesService.getFinalCheckRules(id),
    };
  }

  @Put(':id/final-check-rules')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Final-check-regels vervangen (SUPERUSER)' })
  async updateFinalCheckRules(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateFinalCheckRulesDto,
  ) {
    return {
      success: true,
      data: await this.templatesService.updateFinalCheckRules(id, user, dto),
    };
  }

  // =====================================================
  // TEMPLATE CRUD (generieke routes als laatste)
  // =====================================================

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      'Meetstaat-templates (filters: normType, assetType, status; include=sections voor secties+velden)',
  })
  async findAll(
    @Query('normType') normType?: string,
    @Query('assetType') assetType?: string,
    @Query('status') status?: MeasurementSheetTemplateStatus,
    // WP-B1/B-205: de PWA-referentiesync heeft de volledige templates nodig
    // (sections + velden) zonder N+1 op de detail-route.
    @Query('include') include?: string,
  ) {
    const data = await this.templatesService.findAll({
      normType,
      assetType,
      status,
      includeSections: include === 'sections',
    });
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Template detail (met secties + velden)' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templatesService.findById(id) };
  }

  @Post()
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Template aanmaken (SUPERUSER)' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateMeasurementSheetTemplateDto,
  ) {
    return { success: true, data: await this.templatesService.create(user, dto) };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Template bijwerken (SUPERUSER, alleen CONCEPT)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMeasurementSheetTemplateDto,
  ) {
    return { success: true, data: await this.templatesService.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Template verwijderen (SUPERUSER, alleen CONCEPT)' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.templatesService.delete(id, user) };
  }
}
