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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { LocationTypesService } from './location-types.service';
import {
  CreateLocationTypeDto,
  UpdateLocationTypeDto,
  CreateLocationTypeFieldDto,
  UpdateLocationTypeFieldDto,
  SetConstraintsDto,
  ReorderFieldsDto,
  ValidateParentDto,
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

@ApiTags('location-types')
@ApiBearerAuth()
@Controller('location-types')
export class LocationTypesController {
  constructor(private readonly service: LocationTypesService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Locatie-types (systeem + org)' })
  async findAll(@CurrentUser() user: User, @Query('normType') normType?: string) {
    return { success: true, data: await this.service.findAll(user, { normType }) };
  }

  @Get('merged')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Gemergede locatie-types (org overschrijft systeem op code)' })
  async getMerged(@CurrentUser() user: User, @Query('normType') normType?: string) {
    return { success: true, data: await this.service.getMergedLocationTypes(user, normType) };
  }

  @Get('code/:code')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Locatie-type op code' })
  async findByCode(@CurrentUser() user: User, @Param('code') code: string) {
    return { success: true, data: await this.service.findByCode(code, user) };
  }

  @Post('validate-parent')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Valideer of een ouder-type toegestaan is' })
  async validateParent(@CurrentUser() user: User, @Body() dto: ValidateParentDto) {
    const data = await this.service.validateParentConstraint(
      dto.locationTypeCode,
      dto.parentLocationTypeCode ?? null,
      user,
    );
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Locatie-type detail (met velden + constraints)' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.findById(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Locatie-type aanmaken (org, of systeem als SUPERUSER)' })
  async create(@CurrentUser() user: User, @Body() dto: CreateLocationTypeDto) {
    return { success: true, data: await this.service.create(user, dto) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Locatie-type bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateLocationTypeDto,
  ) {
    return { success: true, data: await this.service.update(id, user, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Locatie-type verwijderen (soft-delete)' })
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
  @ApiOperation({ summary: 'Velden van een locatie-type' })
  async getFields(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.getFields(id, user) };
  }

  @Post(':id/fields')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Veld toevoegen aan locatie-type' })
  async addField(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateLocationTypeFieldDto,
  ) {
    return { success: true, data: await this.service.addField(id, user, dto) };
  }

  @Post(':id/fields/reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Velden herordenen' })
  async reorderFields(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ReorderFieldsDto,
  ) {
    return { success: true, data: await this.service.reorderFields(id, user, dto.fieldIds) };
  }

  @Patch(':locationTypeId/fields/:fieldId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Veld bijwerken' })
  async updateField(
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateLocationTypeFieldDto,
  ) {
    return { success: true, data: await this.service.updateField(fieldId, user, dto) };
  }

  @Delete(':locationTypeId/fields/:fieldId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Veld verwijderen (soft-delete)' })
  async deleteField(
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.deleteField(fieldId, user) };
  }

  // ── Constraints ──
  @Get(':id/constraints')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Parent-constraints van een locatie-type' })
  async getConstraints(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.service.getConstraints(id, user) };
  }

  @Put(':id/constraints')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Parent-constraints instellen (vervangt bestaande)' })
  async setConstraints(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: SetConstraintsDto,
  ) {
    return { success: true, data: await this.service.setConstraints(id, user, dto.constraints) };
  }
}
