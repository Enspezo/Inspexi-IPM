// @Public() (staf-guards uit) + ClientJwtAuthGuard + @CurrentTenant (org-subdomein).
// Statische routes (reinspection/new-assignment) vóór de param-route (:id).

import { Controller, Get, Post, Param, Body, UseGuards} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientRequestsService } from './client-requests.service';
import { ReinspectionRequestDto, NewAssignmentRequestDto } from './dto';
import { ParseUuidPipe } from '@/common';

@ApiTags('Client Requests')
@Public()
@UseGuards(ClientJwtAuthGuard)
@RequiresFeature('BASIS_INSPECTIES')
@Controller('client/requests')
export class ClientRequestsController {
  constructor(private readonly service: ClientRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Verzoeken van de klant (binnen org-subdomein)' })
  async list(
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.list(user, orgId) };
  }

  @Post('reinspection')
  @ApiOperation({ summary: 'Herinspectie aanvragen' })
  async reinspection(
    @Body() dto: ReinspectionRequestDto,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.createReinspection(user, orgId, dto) };
  }

  @Post('new-assignment')
  @ApiOperation({ summary: 'Nieuwe opdracht aanvragen' })
  async newAssignment(
    @Body() dto: NewAssignmentRequestDto,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.createNewAssignment(user, orgId, dto) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Verzoek-detail (klant)' })
  async getOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.getOne(user, orgId, id) };
  }
}
