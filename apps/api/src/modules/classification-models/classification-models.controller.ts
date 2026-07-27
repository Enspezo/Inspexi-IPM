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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { ClassificationModelsService } from './classification-models.service';
import {
  CreateClassificationModelDto,
  UpdateClassificationModelDto,
  CreateCharacteristicStandaloneDto,
  UpdateCharacteristicDto,
  CreateOptionStandaloneDto,
  UpdateOptionDto,
  ReorderCharacteristicsDto,
  ReorderOptionsDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

const READ_ROLES = ALL_STAFF;
const WRITE_ROLES = [Role.SUPERUSER] as const;

@ApiTags('classification-models')
@ApiBearerAuth()
@Controller('classification-models')
export class ClassificationModelsController {
  constructor(private readonly service: ClassificationModelsService) {}

  // ── Modellen ──

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Actieve classificatiemodellen' })
  async findAll() {
    return { success: true, data: await this.service.findAll() };
  }

  @Get('admin')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Alle classificatiemodellen (incl. inactieve)' })
  async findAllAdmin() {
    return { success: true, data: await this.service.findAllAdmin() };
  }

  @Get('code/:code')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Classificatiemodel op code' })
  async findByCode(@Param('code') code: string) {
    return { success: true, data: await this.service.findByCode(code) };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Classificatiemodel detail (met kenmerken + opties)' })
  async findById(@Param('id', ParseUuidPipe) id: string) {
    return { success: true, data: await this.service.findById(id) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Classificatiemodel aanmaken' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateClassificationModelDto,
  ) {
    return { success: true, data: await this.service.create(dto, user.id) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Classificatiemodel bijwerken' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateClassificationModelDto,
  ) {
    return { success: true, data: await this.service.update(id, dto) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Classificatiemodel verwijderen (soft-delete)' })
  async delete(@Param('id', ParseUuidPipe) id: string) {
    return { success: true, data: await this.service.delete(id) };
  }

  // ── Kenmerken ──

  @Post(':modelId/characteristics')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Kenmerk toevoegen aan model' })
  async addCharacteristic(
    @Param('modelId', ParseUuidPipe) modelId: string,
    @Body() dto: CreateCharacteristicStandaloneDto,
  ) {
    return { success: true, data: await this.service.addCharacteristic(modelId, dto) };
  }

  @Post(':modelId/characteristics/reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Kenmerken herordenen' })
  async reorderCharacteristics(
    @Param('modelId', ParseUuidPipe) modelId: string,
    @Body() dto: ReorderCharacteristicsDto,
  ) {
    return {
      success: true,
      data: await this.service.reorderCharacteristics(modelId, dto.characteristicIds),
    };
  }

  @Patch(':modelId/characteristics/:charId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Kenmerk bijwerken' })
  async updateCharacteristic(
    @Param('charId', ParseUuidPipe) charId: string,
    @Body() dto: UpdateCharacteristicDto,
  ) {
    return {
      success: true,
      data: await this.service.updateCharacteristic(charId, dto),
    };
  }

  @Delete(':modelId/characteristics/:charId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Kenmerk verwijderen (opties cascaden mee)' })
  async deleteCharacteristic(
    @Param('charId', ParseUuidPipe) charId: string,
    @Query('confirm') confirm?: string,
  ) {
    return {
      success: true,
      data: await this.service.deleteCharacteristic(charId, confirm === 'true'),
    };
  }

  // ── Opties ──

  @Post(':modelId/characteristics/:charId/options')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Optie toevoegen aan kenmerk' })
  async addOption(
    @Param('charId', ParseUuidPipe) charId: string,
    @Body() dto: CreateOptionStandaloneDto,
  ) {
    return { success: true, data: await this.service.addOption(charId, dto) };
  }

  @Post(':modelId/characteristics/:charId/options/reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Opties herordenen' })
  async reorderOptions(
    @Param('charId', ParseUuidPipe) charId: string,
    @Body() dto: ReorderOptionsDto,
  ) {
    return {
      success: true,
      data: await this.service.reorderOptions(charId, dto.optionIds),
    };
  }

  @Patch(':modelId/characteristics/:charId/options/:optionId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Optie bijwerken' })
  async updateOption(
    @Param('optionId', ParseUuidPipe) optionId: string,
    @Body() dto: UpdateOptionDto,
  ) {
    return { success: true, data: await this.service.updateOption(optionId, dto) };
  }

  @Delete(':modelId/characteristics/:charId/options/:optionId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Optie verwijderen' })
  async deleteOption(
    @Param('optionId', ParseUuidPipe) optionId: string,
    @Query('confirm') confirm?: string,
  ) {
    return {
      success: true,
      data: await this.service.deleteOption(optionId, confirm === 'true'),
    };
  }
}
