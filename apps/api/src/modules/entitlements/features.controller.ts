import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '@/common/decorators';
import { PlansService } from './plans.service';

/**
 * Levert de feature-catalogus (keys/labels/beschrijving/afhankelijkheden) voor de
 * SUPERUSER-beheer-UI: de checkbox-lijst bij plan-bewerking en de per-org-overrides
 * (PRD-09 §5.3). De catalogus is bron-van-waarheid in code; dit endpoint is read-only.
 */
@ApiTags('Plans')
@ApiBearerAuth()
@Roles(Role.SUPERUSER)
@Controller('admin/features')
export class FeaturesController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'Feature-catalogus ophalen (Superuser)' })
  @ApiResponse({ status: 200, description: 'Lijst van feature-definities' })
  getCatalog() {
    return { success: true, data: this.plansService.getCatalog() };
  }
}
