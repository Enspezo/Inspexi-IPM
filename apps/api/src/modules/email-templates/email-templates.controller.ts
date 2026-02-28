import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { User, Role, EmailTemplateType } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@ApiTags('email-templates')
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Lijst alle e-mailsjablonen' })
  async findAll(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('type') type?: EmailTemplateType,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.service.findAll(user, {
      search,
      type,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return { success: true, data };
  }

  @Get('types')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Alle sjabloontypen met beschikbare placeholders' })
  async getTypes() {
    const data = this.service.getTypes();
    return { success: true, data };
  }

  @Post('preview')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Preview sjabloon met voorbeelddata' })
  async preview(
    @Body() body: { subject: string; bodyHtml: string; type: EmailTemplateType },
  ) {
    const data = this.service.preview(body);
    return { success: true, data };
  }

  @Get(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'E-mailsjabloon details' })
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Post()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Nieuw e-mailsjabloon aanmaken' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  @Post(':id/duplicate')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'E-mailsjabloon dupliceren' })
  async duplicate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.duplicate(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'E-mailsjabloon bijwerken' })
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'E-mailsjabloon deactiveren' })
  async deactivate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(id, user);
    return { success: true, data };
  }
}
