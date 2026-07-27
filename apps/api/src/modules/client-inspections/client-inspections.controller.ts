// @Public() (staf-guards uit) + ClientJwtAuthGuard (klant-auth) + @CurrentTenant (org-subdomein).
// Patroon voor alle client-* endpoints. Specifieke routes (dashboard) vóór param-routes (:id).

import { Controller, Get, Param, UseGuards} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientInspectionsService } from './client-inspections.service';
import { ParseUuidPipe } from '@/common';

@ApiTags('Client Inspections')
@Public()
@UseGuards(ClientJwtAuthGuard)
@RequiresFeature('BASIS_INSPECTIES')
@Controller('client/inspections')
export class ClientInspectionsController {
  constructor(private readonly service: ClientInspectionsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard-samenvatting voor de klant' })
  async dashboard(
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.dashboard(user, orgId) };
  }

  @Get()
  @ApiOperation({ summary: 'Inspecties die deze klant mag inzien (binnen org-subdomein)' })
  async list(
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.list(user, orgId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Inspectie-detail (klant)' })
  async detail(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.detail(user, orgId, id) };
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Documenten van een inspectie (klant)' })
  async documents(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.getDocuments(user, orgId, id) };
  }

  @Get(':id/findings')
  @ApiOperation({ summary: 'Constateringen van een inspectie (klant)' })
  async findings(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.getFindings(user, orgId, id) };
  }
}
