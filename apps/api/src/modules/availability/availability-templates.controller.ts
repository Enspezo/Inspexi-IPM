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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { MANAGEMENT_ROLES } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { AvailabilityTemplatesService } from './availability-templates.service';
import {
  CreateAvailabilityTemplateDto,
  UpdateAvailabilityTemplateDto,
  ListAvailabilityTemplatesQueryDto,
} from './dto';

@ApiTags('Availability templates')
@ApiBearerAuth()
@Roles(...MANAGEMENT_ROLES)
@Controller('availability/templates')
export class AvailabilityTemplatesController {
  constructor(private readonly service: AvailabilityTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Beschikbaarheidstemplates ophalen (incl. slots + aantal toewijzingen)' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst templates' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListAvailabilityTemplatesQueryDto,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Beschikbaarheidstemplate aanmaken (naam + slots)' })
  @ApiResponse({ status: 201, description: 'Template aangemaakt' })
  @ApiResponse({ status: 409, description: 'Naam bestaat al binnen de organisatie' })
  async create(@CurrentUser() user: User, @Body() dto: CreateAvailabilityTemplateDto) {
    const data = await this.service.create(user, dto);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Template ophalen' })
  @ApiResponse({ status: 200, description: 'Template details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Template bijwerken (slots worden integraal vervangen)' })
  @ApiResponse({ status: 200, description: 'Template bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvailabilityTemplateDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.update(id, user, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Template verwijderen (soft; geblokkeerd bij actieve toewijzingen)' })
  @ApiResponse({ status: 200, description: 'Template verwijderd' })
  @ApiResponse({ status: 409, description: 'Actieve toewijzingen aanwezig' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.service.remove(id, user);
    return { success: true, message: 'Template verwijderd' };
  }
}
