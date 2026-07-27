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
import { InspectionTemplatesService } from './inspection-templates.service';
import {
  CreateInspectionTemplateDto,
  UpdateInspectionTemplateDto,
  ForkInspectionTemplateDto,
  PublishInspectionTemplateDto,
  RetireInspectionTemplateDto,
  NewVersionDto,
  AddChecklistLinkDto,
  AddMeasurementSheetLinkDto,
  QueryInspectionTemplatesDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

const READ_ROLES = ALL_STAFF;
const WRITE_ROLES = ORG_ADMINS;

@ApiTags('inspection-templates')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('inspection-templates')
export class InspectionTemplatesController {
  constructor(private readonly service: InspectionTemplatesService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Inspectie-templates (systeem + org)' })
  async findAll(@CurrentUser() user: User, @Query() query: QueryInspectionTemplatesDto) {
    return {
      success: true,
      data: await this.service.findAll(user, {
        normType: query.normType,
        status: query.status,
        includeSystem: query.includeSystem,
        search: query.search,
      }),
    };
  }

  // ── Versiebeheer & fork (specifieke routes vóór :id) ──

  @Post(':id/fork')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Systeemtemplate naar eigen org forken (als CONCEPT)' })
  async fork(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ForkInspectionTemplateDto,
  ) {
    return { success: true, data: await this.service.fork(id, user, dto) };
  }

  @Post(':id/publish')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Template publiceren (CONCEPT → ACTIEF)' })
  async publish(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: PublishInspectionTemplateDto,
  ) {
    return { success: true, data: await this.service.publish(id, user, dto) };
  }

  @Post(':id/retire')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Template laten vervallen (ACTIEF → VERVALLEN)' })
  async retire(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RetireInspectionTemplateDto,
  ) {
    return { success: true, data: await this.service.retire(id, user, dto) };
  }

  @Post(':id/new-version')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Nieuwe versie maken (kloon naar CONCEPT)' })
  async createNewVersion(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: NewVersionDto,
  ) {
    return { success: true, data: await this.service.createNewVersion(id, user, dto) };
  }

  @Get(':id/history')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Versiegeschiedenis' })
  async getHistory(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.getHistory(id, user) };
  }

  // ── Checklist-links ──

  @Get(':id/checklists')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Gekoppelde checklists' })
  async getChecklistLinks(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.getChecklistLinks(id, user) };
  }

  @Post(':id/checklists')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist koppelen' })
  async addChecklistLink(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddChecklistLinkDto,
  ) {
    return { success: true, data: await this.service.addChecklistLink(id, user, dto) };
  }

  @Delete(':id/checklists/:linkId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Checklist ontkoppelen' })
  async removeChecklistLink(
    @Param('id', ParseUuidPipe) id: string,
    @Param('linkId', ParseUuidPipe) linkId: string,
    @CurrentUser() user: User,
  ) {
    return {
      success: true,
      data: await this.service.removeChecklistLink(id, linkId, user),
    };
  }

  // ── Meetstaat-links ──

  @Get(':id/measurement-sheets')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Gekoppelde meetstaten' })
  async getMeasurementSheetLinks(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return {
      success: true,
      data: await this.service.getMeasurementSheetLinks(id, user),
    };
  }

  @Post(':id/measurement-sheets')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Meetstaat koppelen' })
  async addMeasurementSheetLink(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddMeasurementSheetLinkDto,
  ) {
    return {
      success: true,
      data: await this.service.addMeasurementSheetLink(id, user, dto),
    };
  }

  @Delete(':id/measurement-sheets/:linkId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Meetstaat ontkoppelen' })
  async removeMeasurementSheetLink(
    @Param('id', ParseUuidPipe) id: string,
    @Param('linkId', ParseUuidPipe) linkId: string,
    @CurrentUser() user: User,
  ) {
    return {
      success: true,
      data: await this.service.removeMeasurementSheetLink(id, linkId, user),
    };
  }

  // ── Generieke :id routes (na de specifieke) ──

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Inspectie-template detail (met links + versies)' })
  async findById(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectie-template aanmaken (org, of systeem als SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateInspectionTemplateDto) {
    return { success: true, data: await this.service.create(user, dto) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectie-template bijwerken (alleen CONCEPT)' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateInspectionTemplateDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectie-template verwijderen (alleen CONCEPT)' })
  async delete(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }
}
