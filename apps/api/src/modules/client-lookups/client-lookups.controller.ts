// @Public() (staf-guards uit) + ClientJwtAuthGuard + @CurrentTenant (org-subdomein).
// Read-only: de klant-UI heeft de per-org status/type-labels nodig voor <LookupBadge>, maar
// het staf-endpoint /lookups/:kind is @Roles-beveiligd. Dit endpoint levert dezelfde gemergede
// lijst (systeemdefaults + org-overrides), org-gescoped via het subdomein i.p.v. een staf-User.

import { Controller, Get, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import { LookupService, LOOKUP_KINDS, type LookupKind } from '../lookups/lookup.service';

@ApiTags('Client Lookups')
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/lookups')
export class ClientLookupsController {
  constructor(private readonly lookups: LookupService) {}

  @Get(':kind')
  @ApiOperation({ summary: 'Lookup-waarden (status/typen) voor de klant-UI, org-gescoped via subdomein' })
  @ApiParam({ name: 'kind', enum: Object.keys(LOOKUP_KINDS) })
  async list(@Param('kind') kind: string, @CurrentTenant('orgId') orgId: string | null) {
    if (!(kind in LOOKUP_KINDS)) {
      throw new BadRequestException(`Onbekende lookup-soort: ${kind}`);
    }
    if (!orgId) {
      throw new BadRequestException('Gebruik het subdomein van uw organisatie');
    }
    const data = await this.lookups.listMergedByOrg(kind as LookupKind, orgId);
    return { success: true, data };
  }
}
