import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseEnumPipe,
  BadRequestException,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, CustomFieldEntityType } from '@prisma/client';
import { ORG_ADMINS } from '@/common/auth/roles';
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  ReorderCustomFieldsDto,
} from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { ParseUuidPipe } from '@/common';

@ApiTags('Custom Fields')
@ApiBearerAuth()
@RequiresFeature('CUSTOM_FIELDS')
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  /**
   * Aangepaste velden zijn per-org. Een SUPERUSER (orgId = null) heeft geen
   * org-context: lees-routes leveren dan een lege lijst, schrijf-routes een nette
   * 400 — i.p.v. een onhandelbare 500 op een null-orgId-query.
   */
  private requireOrg(user: User): string {
    if (!user.orgId) {
      throw new BadRequestException(
        'Aangepaste velden zijn alleen beschikbaar binnen een organisatie',
      );
    }
    return user.orgId;
  }

  @Get()
  @ApiOperation({ summary: 'Alle eigen velden voor de organisatie' })
  findAll(@CurrentUser() user: User) {
    if (!user.orgId) return [];
    return this.customFieldsService.findAll(user.orgId);
  }

  @Get(':entityType')
  @ApiOperation({ summary: 'Eigen velden per entiteitstype' })
  findByEntityType(
    @Param('entityType', new ParseEnumPipe(CustomFieldEntityType))
    entityType: CustomFieldEntityType,
    @CurrentUser() user: User,
  ) {
    if (!user.orgId) return [];
    return this.customFieldsService.findByEntityType(user.orgId, entityType);
  }

  @Post()
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Nieuw eigen veld aanmaken' })
  create(@Body() dto: CreateCustomFieldDto, @CurrentUser() user: User) {
    return this.customFieldsService.create(this.requireOrg(user), dto);
  }

  @Patch('reorder')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Volgorde eigen velden aanpassen' })
  reorder(@Body() dto: ReorderCustomFieldsDto, @CurrentUser() user: User) {
    return this.customFieldsService.reorder(this.requireOrg(user), dto.orderedIds);
  }

  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Eigen veld bijwerken' })
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() user: User,
  ) {
    return this.customFieldsService.update(id, this.requireOrg(user), dto);
  }

  @Delete(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Eigen veld verwijderen (soft-delete)' })
  remove(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.customFieldsService.remove(id, this.requireOrg(user));
  }
}
