import { Module } from '@nestjs/common';
import { PortalStatsController } from './portal-stats.controller';
import { PortalStatsService } from './portal-stats.service';

@Module({
  controllers: [PortalStatsController],
  providers: [PortalStatsService],
  exports: [PortalStatsService],
})
export class PortalStatsModule {}
