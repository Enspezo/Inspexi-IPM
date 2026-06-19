// Doel in apps/api: src/modules/client-inspections/client-inspections.controller.ts
//
// @Public() (staf-guards uit) + ClientJwtAuthGuard (klant-auth) + @CurrentTenant (org-subdomein).
// Patroon voor alle client-* endpoints (documents/findings/messages/requests).

import { Controller, Get, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import { CurrentClientUser, type CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';
import { ClientInspectionsService } from './client-inspections.service';

@ApiTags('Client Inspections')
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/inspections')
export class ClientInspectionsController {
  constructor(private readonly service: ClientInspectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Inspecties die deze klant mag inzien (binnen org-subdomein)' })
  async list(@CurrentClientUser() user: CurrentClientUserData, @CurrentTenant('orgId') orgId: string | null) {
    return { success: true, data: await this.service.list(user, orgId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Inspectie-detail (klant)' })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.detail(user, orgId, id) };
  }
}
