// Online herstel van constateringen (PRD-14). Leunt op ClientInspectionsService
// voor de ClientAccess-scoping van de ingelogde ingang; verder leest de module
// plannen/findings rechtstreeks via Prisma (geen circulaire feature-imports).

import { Module } from '@nestjs/common';
import { ClientInspectionsModule } from '../client-inspections/client-inspections.module';
import { ClientRepairController } from './client-repair.controller';
import { ClientRepairService } from './client-repair.service';
import { RepairSessionGuard } from './repair-session.guard';
import { RepairEventsService } from './repair-events.service';

@Module({
  imports: [ClientInspectionsModule],
  controllers: [ClientRepairController],
  providers: [ClientRepairService, RepairSessionGuard, RepairEventsService],
  exports: [ClientRepairService],
})
export class ClientRepairModule {}
