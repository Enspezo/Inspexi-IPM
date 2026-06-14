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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { InspectionPlansService } from './inspection-plans.service';
import {
  CreateInspectionPlanDto,
  UpdateInspectionPlanDto,
  ListInspectionPlansQueryDto,
  SubmitInspectionPlanDto,
  ReviewInspectionPlanDto,
} from './dto';

const WRITE_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
] as const;

const ALL_ROLES = [...WRITE_ROLES, Role.INSPECTEUR] as const;

const REVIEW_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.WERKVOORBEREIDER,
] as const;

@ApiTags('inspection-plans')
@ApiBearerAuth()
@Controller('inspection-plans')
export class InspectionPlansController {
  constructor(private readonly service: InspectionPlansService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Inspectieplannen ophalen (gepagineerd)' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListInspectionPlansQueryDto,
  ) {
    return { success: true, data: await this.service.findAll(user, query) };
  }

  // Specifieke routes vóór parameterized routes (NestJS route-volgorde).
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Indienen ter review' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.submit(id, dto, user) };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(...REVIEW_ROLES)
  @ApiOperation({ summary: 'Inspectieplan beoordelen (goedkeuren/afkeuren)' })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.review(id, dto, user) };
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Inspectieplan detail' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.findOne(id, user) };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectieplan aanmaken' })
  async create(
    @Body() dto: CreateInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.create(dto, user) };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectieplan bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInspectionPlanDto,
    @CurrentUser() user: User,
  ) {
    return { success: true, data: await this.service.update(id, dto, user) };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Inspectieplan verwijderen (soft-delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.service.remove(id, user);
    return { success: true, message: 'Inspectieplan verwijderd' };
  }
}
