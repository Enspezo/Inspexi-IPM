// Doel in apps/api: src/modules/asset-types/asset-types.controller.ts
//
// Lezen: alle rollen (incl. INSPECTEUR — de PWA leest asset-types + /merged + validate-parent).
// Schrijven: SUPERUSER (systeemtypes) + ORG_ADMIN (org-types).
// Route-volgorde: statische routes (merged, code/:code, validate-parent) vóór :id.

import {
  Controller, Get, Post, Patch, Delete, Put, Param, Body, Query, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { AssetTypesService } from './asset-types.service';
import {
  CreateAssetTypeDto, UpdateAssetTypeDto,
  CreateAssetTypeFieldDto, UpdateAssetTypeFieldDto,
  SetConstraintsDto, ReorderFieldsDto, ValidateParentDto,
} from './dto';

const READ_ROLES = [
  Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER,
  Role.BACKOFFICE, Role.WERKVOORBEREIDER, Role.INSPECTEUR,
] as const;
const WRITE_ROLES = [Role.SUPERUSER, Role.ORG_ADMIN] as const;

@ApiTags('Asset Types')
@ApiBearerAuth()
@Controller('asset-types')
export class AssetTypesController {
  constructor(private readonly service: AssetTypesService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Asset-types (systeem + org)' })
  async findAll(@CurrentUser() user: User, @Query('normType') normType?: string) {
    return { success: true, data: await this.service.findAll(user, { normType }) };
  }

  @Get('merged')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Gemergede asset-types (org overschrijft systeem op code)' })
  async getMerged(@CurrentUser() user: User, @Query('normType') normType?: string) {
    return { success: true, data: await this.service.getMergedAssetTypes(user, normType) };
  }

  @Get('code/:code')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Asset-type op code' })
  async findByCode(@CurrentUser() user: User, @Param('code') code: string) {
    return { success: true, data: await this.service.findByCode(code, user) };
  }

  @Post('validate-parent')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Valideer of een ouder-type toegestaan is' })
  async validateParent(@CurrentUser() user: User, @Body() dto: ValidateParentDto) {
    const data = await this.service.validateParentConstraint(
      dto.assetTypeCode, dto.parentAssetTypeCode ?? null, user,
    );
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Asset-type detail (met velden + constraints)' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Asset-type aanmaken (org, of systeem als SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateAssetTypeDto) {
    return { success: true, data: await this.service.create(user, dto) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Asset-type bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateAssetTypeDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Asset-type verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.delete(id, user) };
  }

  @Post(':id/duplicate')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Systeemtype naar eigen org dupliceren' })
  async duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.duplicate(id, user) };
  }

  // ── Velden ──
  @Get(':id/fields')
  @Roles(...READ_ROLES)
  async getFields(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.getFields(id, user) };
  }

  @Post(':id/fields')
  @Roles(...WRITE_ROLES)
  async addField(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateAssetTypeFieldDto,
  ) {
    return { success: true, data: await this.service.addField(id, user, dto) };
  }

  @Post(':id/fields/reorder')
  @Roles(...WRITE_ROLES)
  async reorderFields(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ReorderFieldsDto,
  ) {
    return { success: true, data: await this.service.reorderFields(id, user, dto.fieldIds) };
  }

  @Patch(':assetTypeId/fields/:fieldId')
  @Roles(...WRITE_ROLES)
  async updateField(
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateAssetTypeFieldDto,
  ) {
    return { success: true, data: await this.service.updateField(fieldId, user, dto) };
  }

  @Delete(':assetTypeId/fields/:fieldId')
  @Roles(...WRITE_ROLES)
  async deleteField(
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.deleteField(fieldId, user) };
  }

  // ── Constraints ──
  @Get(':id/constraints')
  @Roles(...READ_ROLES)
  async getConstraints(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.getConstraints(id, user) };
  }

  @Put(':id/constraints')
  @Roles(...WRITE_ROLES)
  async setConstraints(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SetConstraintsDto,
  ) {
    return { success: true, data: await this.service.setConstraints(id, user, dto.constraints) };
  }
}
