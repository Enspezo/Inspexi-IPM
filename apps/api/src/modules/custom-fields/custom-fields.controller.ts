import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role, CustomFieldEntityType } from '@prisma/client';
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  ReorderCustomFieldsDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

@ApiTags('Custom Fields')
@ApiBearerAuth()
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  @ApiOperation({ summary: 'Alle eigen velden voor de organisatie' })
  findAll(@CurrentUser() user: User) {
    return this.customFieldsService.findAll(user.orgId!);
  }

  @Get(':entityType')
  @ApiOperation({ summary: 'Eigen velden per entiteitstype' })
  findByEntityType(
    @Param('entityType', new ParseEnumPipe(CustomFieldEntityType))
    entityType: CustomFieldEntityType,
    @CurrentUser() user: User,
  ) {
    return this.customFieldsService.findByEntityType(user.orgId!, entityType);
  }

  @Post()
  @Roles(Role.ORG_ADMIN, Role.SUPERUSER)
  @ApiOperation({ summary: 'Nieuw eigen veld aanmaken' })
  create(@Body() dto: CreateCustomFieldDto, @CurrentUser() user: User) {
    return this.customFieldsService.create(user.orgId!, dto);
  }

  @Patch('reorder')
  @Roles(Role.ORG_ADMIN, Role.SUPERUSER)
  @ApiOperation({ summary: 'Volgorde eigen velden aanpassen' })
  reorder(@Body() dto: ReorderCustomFieldsDto, @CurrentUser() user: User) {
    return this.customFieldsService.reorder(user.orgId!, dto.orderedIds);
  }

  @Patch(':id')
  @Roles(Role.ORG_ADMIN, Role.SUPERUSER)
  @ApiOperation({ summary: 'Eigen veld bijwerken' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() user: User,
  ) {
    return this.customFieldsService.update(id, user.orgId!, dto);
  }

  @Delete(':id')
  @Roles(Role.ORG_ADMIN, Role.SUPERUSER)
  @ApiOperation({ summary: 'Eigen veld verwijderen (soft-delete)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.customFieldsService.remove(id, user.orgId!);
  }
}
