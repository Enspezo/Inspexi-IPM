import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { PortalStatsService } from './portal-stats.service';

// Read-only: alle 6 rollen mogen het dashboard lezen.
const ALL = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
] as const;

@ApiTags('portal-stats')
@ApiBearerAuth()
@Controller('portal/stats')
export class PortalStatsController {
  constructor(private readonly service: PortalStatsService) {}

  @Get('dashboard')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Dashboard-samenvatting (org-scoped tellingen)' })
  async getDashboardStats(@CurrentUser() user: User) {
    return { success: true, data: await this.service.getDashboardStats(user) };
  }

  @Get('inspections-chart')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Inspecties per week (laatste 8 weken)' })
  async getInspectionsChart(@CurrentUser() user: User) {
    return { success: true, data: await this.service.getInspectionsChart(user) };
  }

  @Get('activities')
  @Roles(...ALL)
  @ApiOperation({ summary: 'Recente activiteiten (org-scoped, gelimiteerd)' })
  async getRecentActivities(@CurrentUser() user: User) {
    return { success: true, data: await this.service.getRecentActivities(user) };
  }
}
