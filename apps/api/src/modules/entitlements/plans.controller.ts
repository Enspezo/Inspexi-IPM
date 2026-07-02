import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '@/common/decorators';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto';

/**
 * SUPERUSER-beheer voor abonnementsplannen (PRD-09 §5.3). Alleen SUPERUSER; geen
 * @RequiresFeature (platform-functie, SUPERUSER omzeilt de FeatureGuard sowieso).
 */
@ApiTags('Plans')
@ApiBearerAuth()
@Roles(Role.SUPERUSER)
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'Alle abonnementsplannen ophalen (Superuser)' })
  @ApiResponse({ status: 200, description: 'Lijst van plannen' })
  async findAll() {
    const data = await this.plansService.findAll();
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Abonnement ophalen op ID (Superuser)' })
  @ApiResponse({ status: 200, description: 'Plan-details incl. features' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.plansService.findOne(id);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Abonnement aanmaken (Superuser)' })
  @ApiResponse({ status: 201, description: 'Plan aangemaakt' })
  @ApiResponse({ status: 409, description: 'Slug al in gebruik / onbekende feature-key' })
  async create(@Body() dto: CreatePlanDto) {
    const data = await this.plansService.create(dto);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Abonnement bijwerken (Superuser)' })
  @ApiResponse({ status: 200, description: 'Plan bijgewerkt' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    const data = await this.plansService.update(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Abonnement verwijderen (Superuser)' })
  @ApiResponse({ status: 200, description: 'Plan verwijderd' })
  @ApiResponse({ status: 409, description: 'Plan nog toegewezen aan organisaties' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.plansService.remove(id);
    return { success: true, data };
  }
}
