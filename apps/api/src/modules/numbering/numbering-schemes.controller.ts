import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  BadRequestException,
  ParseEnumPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, NumberingModel } from '@prisma/client';
import { ALL_STAFF, ORG_ADMINS } from '@/common/auth/roles';
import { Roles, CurrentUser, CurrentTenant } from '@/common/decorators';
import { TenantContext } from '@/common/interfaces';
import { NumberingService } from './numbering.service';
import { UpdateNumberingSchemeDto } from './dto';

/**
 * Per-org, per-model numbering configuration. Reads are open to all staff (create
 * flows need to know `allowManualEntry`); writes are ORG_ADMIN-only.
 */
@ApiTags('Numbering Schemes')
@ApiBearerAuth()
@Controller('numbering-schemes')
export class NumberingSchemesController {
  constructor(private readonly numbering: NumberingService) {}

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Alle nummering-schemas voor de organisatie' })
  async list(@CurrentUser() user: User, @CurrentTenant() tenant: TenantContext) {
    const data = await this.numbering.listSchemes(this.resolveOrgId(user, tenant));
    return { success: true, data };
  }

  @Get(':model/preview')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Voorbeeldnummer voor een schema (geen tellerophoging)' })
  async preview(
    @Param('model', new ParseEnumPipe(NumberingModel)) model: NumberingModel,
    @CurrentUser() user: User,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const data = await this.numbering.preview(this.resolveOrgId(user, tenant), model);
    return { success: true, data };
  }

  @Get(':model')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Nummering-schema per model ophalen' })
  async getOne(
    @Param('model', new ParseEnumPipe(NumberingModel)) model: NumberingModel,
    @CurrentUser() user: User,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const data = await this.numbering.getScheme(this.resolveOrgId(user, tenant), model);
    return { success: true, data };
  }

  @Patch(':model')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Nummering-schema per model bijwerken' })
  async update(
    @Param('model', new ParseEnumPipe(NumberingModel)) model: NumberingModel,
    @Body() dto: UpdateNumberingSchemeDto,
    @CurrentUser() user: User,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const data = await this.numbering.updateScheme(
      this.resolveOrgId(user, tenant),
      model,
      dto,
    );
    return { success: true, data };
  }

  /** Org from the user, falling back to the tenant (SUPERUSER acting on an org domain). */
  private resolveOrgId(user: User, tenant: TenantContext): string {
    const orgId = user.orgId ?? tenant.orgId;
    if (!orgId) {
      throw new BadRequestException('Selecteer eerst een organisatie');
    }
    return orgId;
  }
}
