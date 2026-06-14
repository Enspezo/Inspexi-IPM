// Doel in apps/api: src/modules/lookups/lookup.controller.ts
//
// Eén controller voor alle 11 lookup-soorten via :kind path-param.
// Lezen: alle ingelogde rollen. Schrijven: ORG_ADMIN (eigen org-rijen) + SUPERUSER (defaults).

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { LookupService, LOOKUP_KINDS, LookupKind } from './lookup.service';
import { CreateLookupDto, UpdateLookupDto } from './dto';

@ApiTags('Lookups')
@ApiBearerAuth()
@Controller('lookups')
export class LookupController {
  constructor(private readonly lookups: LookupService) {}

  private assertKind(kind: string): LookupKind {
    if (!(kind in LOOKUP_KINDS)) {
      throw new BadRequestException(`Onbekende lookup-soort: ${kind}`);
    }
    return kind as LookupKind;
  }

  @Get(':kind')
  @Roles(
    Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER,
    Role.BACKOFFICE, Role.WERKVOORBEREIDER, Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Lookup-waarden ophalen (systeemdefaults + org-overrides, gemerged)' })
  @ApiParam({ name: 'kind', enum: Object.keys(LOOKUP_KINDS) })
  async list(@Param('kind') kind: string, @CurrentUser() user: User) {
    const data = await this.lookups.listMerged(this.assertKind(kind), user);
    return { success: true, data };
  }

  @Get(':kind/manage')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Ruwe lookup-rijen voor beheer (defaults + org-rijen apart)' })
  async listRaw(@Param('kind') kind: string, @CurrentUser() user: User) {
    const data = await this.lookups.listRaw(this.assertKind(kind), user);
    return { success: true, data };
  }

  @Post(':kind')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Lookup-waarde toevoegen (org-rij of — als SUPERUSER — systeemdefault)' })
  async create(
    @Param('kind') kind: string,
    @Body() dto: CreateLookupDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.lookups.create(this.assertKind(kind), dto, user);
    return { success: true, data };
  }

  @Patch(':kind/:id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Lookup-waarde bijwerken (label/kleur/volgorde/actief)' })
  async update(
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLookupDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.lookups.update(this.assertKind(kind), id, dto, user);
    return { success: true, data };
  }

  @Delete(':kind/:id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Lookup-waarde verwijderen (alleen eigen org-rijen / superuser-defaults)' })
  async remove(
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.lookups.remove(this.assertKind(kind), id, user);
    return { success: true, message: 'Lookup-waarde verwijderd' };
  }
}
