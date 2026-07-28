import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { AvailabilityResolutionService } from './availability-resolution.service';
import { ResolvedAvailabilityQueryDto, CheckAvailabilityQueryDto } from './dto';

/**
 * Berekende beschikbaarheid. Planners (CRM/management) mogen elke inspecteur
 * opvragen; een INSPECTEUR alleen zichzelf (afgedwongen in de service). `resolved`
 * levert per inspecteur per dag de intervallen + bronnen; `check` toetst een
 * concreet tijdvenster (gebruikt door de planning-integratie in fase 4).
 */
@ApiTags('Availability resolved')
@ApiBearerAuth()
@Roles(...ALL_STAFF)
@Controller('availability')
export class AvailabilityResolutionController {
  constructor(private readonly service: AvailabilityResolutionService) {}

  @Get('resolved')
  @ApiOperation({ summary: 'Resolved availability per inspecteur per dag (max 3 maanden)' })
  @ApiResponse({ status: 200, description: 'Dagresultaten met intervallen en bronnen' })
  @ApiResponse({ status: 400, description: 'Bereik ongeldig of groter dan 3 maanden' })
  async resolved(
    @Query() query: ResolvedAvailabilityQueryDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.resolve(user, query.from, query.to, query.userIds);
    return { success: true, data };
  }

  @Get('check')
  @ApiOperation({ summary: 'Toets of een inspecteur beschikbaar is in een tijdvenster' })
  @ApiResponse({ status: 200, description: '{ available, coveredIntervals, conflicts }' })
  async check(
    @Query() query: CheckAvailabilityQueryDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.check(user, query.userId, query.start, query.end);
    return { success: true, data };
  }
}
